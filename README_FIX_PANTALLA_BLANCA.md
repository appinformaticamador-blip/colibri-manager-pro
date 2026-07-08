# Fix pantalla blanca Colibrí ERP

El problema era que `index.html` cargaba `/src/App.jsx`, pero `App.jsx` no montaba React en `#root`.

Se ha añadido al final de `src/App.jsx`:

```jsx
const rootEl = document.getElementById('root');
if (rootEl) {
  createRoot(rootEl).render(<App />);
}
```

## Instalación
1. Copia `src/App.jsx` sobre tu repositorio.
2. Commit: `Fix pantalla blanca React root`
3. Push a `develop`.
4. Vercel redeploy.
