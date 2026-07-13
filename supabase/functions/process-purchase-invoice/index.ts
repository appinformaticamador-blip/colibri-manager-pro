import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function normalize(value: unknown) {
  return String(value ?? '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ')
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunk, bytes.length)))
  }
  return btoa(binary)
}

function extractOutputText(payload: any) {
  if (typeof payload?.output_text === 'string') return payload.output_text
  for (const output of payload?.output ?? []) {
    for (const content of output?.content ?? []) {
      if (typeof content?.text === 'string') return content.text
    }
  }
  return ''
}

const schema = {
  type: 'object',
  additionalProperties: false,
  required: ['supplier','invoice_number','invoice_date','subtotal','tax_total','total','items'],
  properties: {
    supplier: {
      type: 'object', additionalProperties: false,
      required: ['name','tax_id'],
      properties: { name: { type: 'string' }, tax_id: { type: 'string' } }
    },
    invoice_number: { type: 'string' },
    invoice_date: { type: 'string' },
    subtotal: { type: 'number' },
    tax_total: { type: 'number' },
    total: { type: 'number' },
    items: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['description','supplier_sku','quantity','pack_units','unit','net_total','tax_rate','suggested_category','suggested_sub_category','confidence'],
        properties: {
          description: { type: 'string' }, supplier_sku: { type: 'string' }, quantity: { type: 'number' },
          pack_units: { type: 'number' }, unit: { type: 'string' }, net_total: { type: 'number' }, tax_rate: { type: 'number' },
          suggested_category: { type: 'string' }, suggested_sub_category: { type: 'string' }, confidence: { type: 'number' }
        }
      }
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const openAiKey = Deno.env.get('OPENAI_API_KEY')
  const model = Deno.env.get('OPENAI_INVOICE_MODEL') || 'gpt-4.1-mini'
  const db = createClient(supabaseUrl, serviceKey)
  let invoiceId = ''
  try {
    const body = await req.json()
    invoiceId = String(body?.invoice_id || '')
    if (!invoiceId) throw new Error('invoice_id obligatorio')
    if (!openAiKey) throw new Error('Falta configurar OPENAI_API_KEY en Supabase Edge Functions')

    const { data: invoice, error: invoiceError } = await db.from('purchase_invoices').select('*').eq('id', invoiceId).single()
    if (invoiceError || !invoice) throw new Error(invoiceError?.message || 'Factura no encontrada')
    if (!invoice.file_path) throw new Error('La factura no tiene archivo para procesar')

    await db.from('purchase_invoices').update({
      status: 'processing', processing_progress: 15, processing_step: 'Abriendo foto/PDF', processing_error: null,
      processing_started_at: new Date().toISOString()
    }).eq('id', invoiceId)

    const { data: blob, error: downloadError } = await db.storage.from('purchase-invoices').download(invoice.file_path)
    if (downloadError || !blob) throw new Error(downloadError?.message || 'No se pudo descargar el archivo')
    const bytes = new Uint8Array(await blob.arrayBuffer())
    const mime = invoice.file_type || blob.type || 'application/pdf'
    const base64 = bytesToBase64(bytes)

    await db.from('purchase_invoices').update({ processing_progress: 35, processing_step: 'Leyendo proveedor, totales y artículos' }).eq('id', invoiceId)

    const fileContent = mime.startsWith('image/')
      ? { type: 'input_image', image_url: `data:${mime};base64,${base64}` }
      : { type: 'input_file', filename: invoice.file_name || 'factura.pdf', file_data: `data:${mime};base64,${base64}` }

    const prompt = `Analiza esta factura de proveedor de hostelería española. Devuelve exclusivamente los datos del esquema JSON.\n
Reglas:\n- No inventes datos ilegibles: usa cadena vacía o 0.\n- quantity es número de bultos, cajas, kilos o unidades facturadas.\n- pack_units es cuántas unidades contiene cada bulto; si no consta, 1.\n- net_total es el importe neto de la línea después de descuentos y antes del IVA.\n- unit debe ser ud, kg, l, caja, paquete u otra abreviatura breve.\n- Categorías permitidas: Materia prima; Bebidas; Consumibles de servicio; Limpieza e higiene; Menaje; Utensilios y pequeño equipamiento; Energía y suministros; Mantenimiento y reparación; Otros gastos.\n- Carnes, pescados, pan, jamón, york, mantequilla y alimentos para recetas son Materia prima.\n- Papel, servilletas, bolsas y envases son Consumibles de servicio.\n- Vasos, copas, platos y cubiertos son Menaje.\n- Cuchillos, mecheros, sartenes y pinzas son Utensilios y pequeño equipamiento.\n- Bombonas, gas y carbón son Energía y suministros.\n- confidence entre 0 y 1.`

    const aiResponse = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${openAiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        input: [{ role: 'user', content: [{ type: 'input_text', text: prompt }, fileContent] }],
        text: { format: { type: 'json_schema', name: 'invoice_extraction', strict: true, schema } }
      })
    })
    const aiPayload = await aiResponse.json()
    if (!aiResponse.ok) throw new Error(aiPayload?.error?.message || `OpenAI HTTP ${aiResponse.status}`)
    const outputText = extractOutputText(aiPayload)
    if (!outputText) throw new Error('La IA no devolvió datos estructurados')
    const extracted = JSON.parse(outputText)

    await db.from('purchase_invoices').update({ processing_progress: 70, processing_step: 'Comparando proveedor y clasificando artículos' }).eq('id', invoiceId)

    const { data: suppliers } = await db.from('purchase_suppliers').select('*')
    const supplierName = String(extracted?.supplier?.name || '').trim()
    const supplier = (suppliers || []).find((s: any) => normalize(s.name) === normalize(supplierName)) || null

    await db.from('purchase_invoice_items').delete().eq('invoice_id', invoiceId).eq('source', 'ai')
    const itemRows = (extracted.items || []).filter((x: any) => String(x.description || '').trim()).map((x: any) => {
      const quantity = Math.max(0, Number(x.quantity || 0))
      const packUnits = Math.max(1, Number(x.pack_units || 1))
      const netTotal = Math.max(0, Number(x.net_total || 0))
      return {
        invoice_id: invoiceId,
        product_name: String(x.description).trim(), raw_description: String(x.description).trim(), supplier_sku: x.supplier_sku || null,
        quantity, pack_units: packUnits, unit: x.unit || 'ud', net_total: netTotal, tax_rate: Number(x.tax_rate || 0),
        unit_cost: quantity > 0 ? netTotal / (quantity * packUnits) : 0,
        category: x.suggested_category || null, sub_category: x.suggested_sub_category || null,
        review_status: 'pending', source: 'ai', confidence: Math.max(0, Math.min(1, Number(x.confidence || 0)))
      }
    })
    if (itemRows.length) {
      const { error: itemError } = await db.from('purchase_invoice_items').insert(itemRows)
      if (itemError) throw new Error(itemError.message)
    }

    const invoiceDate = /^\d{4}-\d{2}-\d{2}$/.test(extracted.invoice_date || '') ? extracted.invoice_date : invoice.invoice_date
    const update = {
      supplier_id: supplier?.id || invoice.supplier_id || null,
      detected_supplier_name: supplierName || null,
      detected_supplier_tax_id: extracted?.supplier?.tax_id || null,
      invoice_number: extracted.invoice_number || invoice.invoice_number || null,
      invoice_date: invoiceDate,
      subtotal: Number(extracted.subtotal || 0), tax_total: Number(extracted.tax_total || 0), total: Number(extracted.total || 0),
      extraction_payload: extracted, extraction_version: 'rc370-v1', status: 'awaiting_review', processing_progress: 100,
      processing_step: `Lectura terminada: ${itemRows.length} artículos. Esperando validación`, processing_finished_at: new Date().toISOString()
    }
    const { error: updateError } = await db.from('purchase_invoices').update(update).eq('id', invoiceId)
    if (updateError) throw new Error(updateError.message)

    return new Response(JSON.stringify({ ok: true, invoice_id: invoiceId, items: itemRows.length, new_supplier: !supplier && !!supplierName }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (error) {
    if (invoiceId) await db.from('purchase_invoices').update({
      status: 'failed', processing_progress: 0, processing_step: 'Procesamiento detenido', processing_error: error instanceof Error ? error.message : String(error),
      processing_finished_at: new Date().toISOString()
    }).eq('id', invoiceId)
    return new Response(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
