import React from 'react';
import {createRoot} from 'react-dom/client';
import {createClient} from '@supabase/supabase-js';
import PeoplePortal from './modules/people/PeoplePortal.jsx';
import './styles.css';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnon = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = supabaseUrl && supabaseAnon ? createClient(supabaseUrl, supabaseAnon) : null;

function PeopleBrand(){
  return <div className="brand peopleStandaloneBrand">
    <div className="brandMark"><img src="/colibri-brand.png" alt="Colibrí" /></div>
    <div><h1>Colibrí <span>People</span></h1><p>Brasería El Colibrí</p></div>
  </div>;
}

function PeopleRoot(){
  if(!supabase) return <main className="peopleLogin"><PeopleBrand/><div className="peopleCard peopleLoginCard"><h2>Configuración pendiente</h2><p>Faltan las variables VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en Vercel.</p></div></main>;
  return <PeoplePortal supabase={supabase} Brand={PeopleBrand}/>;
}

const root = document.getElementById('root');
if(!root) throw new Error('No se encontró el elemento #root');
createRoot(root).render(<PeopleRoot/>);

if('serviceWorker' in navigator){
  window.addEventListener('load',()=>navigator.serviceWorker.register('/people-sw.js').catch(()=>{}));
}
