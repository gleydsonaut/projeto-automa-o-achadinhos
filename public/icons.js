const paths = {
  overview:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  automations:'<path d="m13 2-9 12h7l-1 8 10-12h-7l1-8Z"/>',
  products:'<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="M3 8v9l9 5 9-5V8M12 13v9M7.5 5.5l9 5"/>',
  keywords:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5M8 10.5h5"/>',
  coupons:'<path d="M20 13 11 22 2 13V3h10l8 8a1.4 1.4 0 0 1 0 2Z"/><circle cx="7" cy="8" r="1.5"/>',
  lists:'<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M9 8h7M9 12h7M9 16h5M7 8h.01M7 12h.01M7 16h.01"/>',
  videos:'<rect x="3" y="4" width="18" height="16" rx="3"/><path d="m10 8 6 4-6 4V8Z"/>',
  videoGroups:'<rect x="6" y="7" width="15" height="14" rx="2"/><path d="M17 3H5a2 2 0 0 0-2 2v12m10-6 4 3-4 3v-6Z"/>',
  groups:'<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3m2-16a3 3 0 0 1 0 6m1 4a5 5 0 0 1 3 5"/>',
  whatsapp:'<path d="M21 11.5a8.8 8.8 0 0 1-9 8.5 9 9 0 0 1-4-.9L3 21l1.7-5A8.2 8.2 0 0 1 3 11.5 8.8 8.8 0 0 1 12 3a8.8 8.8 0 0 1 9 8.5Z"/><path d="M8 8c0 4 2 6 6 7l2-2-2-1-1 1-3-3 1-1-1-2-2 1Z"/>',
  operations:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  settings:'<path d="M12 3v3m0 12v3M3 12h3m12 0h3M5.6 5.6l2.1 2.1m8.6 8.6 2.1 2.1M5.6 18.4l2.1-2.1m8.6-8.6 2.1-2.1"/><circle cx="12" cy="12" r="5"/>',
  arrow:'<path d="M5 12h14m-5-5 5 5-5 5"/>',
  chevron:'<path d="m9 5 7 7-7 7"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  close:'<path d="m6 6 12 12M6 18 18 6"/>',
  menu:'<path d="M4 6h16M4 12h16M4 18h16"/>',
  check:'<path d="m5 12 4 4L19 6"/>',
  logout:'<path d="M9 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h4m6-16 6 7-6 7m-6-7h12"/>',
  mark:'<path fill="currentColor" stroke="none" d="M4 4h11l5 5v11H9l-5-5V4Zm5 5v6h6V9H9Z"/>',
};
export function icon(name, className='') {
  return `<svg class="ui-icon ${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths[name]||paths.products}</svg>`;
}
