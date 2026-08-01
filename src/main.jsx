const isPeoplePortal = window.location.hostname.startsWith('fichar.') || window.location.pathname === '/fichar' || window.location.pathname.startsWith('/fichar/');

if (isPeoplePortal) {
  document.title = 'Colibrí People · Mi Jornada';
  import('./people-entry.jsx');
} else {
  document.title = 'Colibrí ERP · Gerencia';
  // Carga exactamente el ERP estable existente. El portal del empleado vive en otro módulo.
  import('./App.jsx');
}
