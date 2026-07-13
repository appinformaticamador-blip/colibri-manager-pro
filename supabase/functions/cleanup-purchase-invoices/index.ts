import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  try {
    const { data: expired, error } = await db.from('purchase_invoices')
      .select('id,file_path').not('file_path','is',null).is('file_deleted_at',null)
      .lt('retention_delete_at',new Date().toISOString()).limit(500)
    if (error) throw error
    const paths = (expired || []).map((x: any) => x.file_path).filter(Boolean)
    if (paths.length) {
      const { error: storageError } = await db.storage.from('purchase-invoices').remove(paths)
      if (storageError) throw storageError
      const now = new Date().toISOString()
      for (const row of expired || []) {
        await db.from('purchase_invoices').update({ file_path: null, file_deleted_at: now }).eq('id', row.id)
      }
    }
    return new Response(JSON.stringify({ ok: true, deleted: paths.length }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (error) {
    return new Response(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
