/* ============================================================
   Alixo — bibliothèque d'icônes SVG (traits, 24×24, currentColor)
   Remplace tous les émojis de l'interface. Utilisation :
   AlixoIcons.svg('scale', 'ficon')  →  <svg class="ico ficon" …>
   ============================================================ */
(function () {
  'use strict';

  const ICONS = {
    /* études */
    'book': '<path d="M4 5a2 2 0 0 1 2-2h14v16H6a2 2 0 0 0-2 2Z"/><path d="M4 21a2 2 0 0 1 2-2h14"/>',
    'book-open': '<path d="M12 6c-2-1.5-5-2-9-2v14c4 0 7 .5 9 2 2-1.5 5-2 9-2V4c-4 0-7 .5-9 2Z"/><path d="M12 6v14"/>',
    'pencil': '<path d="M4 20h4L19 9l-4-4L4 16v4Z"/><path d="m13 7 4 4"/>',
    'pen-line': '<path d="M4 20h16"/><path d="m5 16 10-10 3 3L8 19H5Z"/>',
    'graduation-cap': '<path d="m2 9 10-4 10 4-10 4Z"/><path d="M6 11v5c0 1.5 3 3 6 3s6-1.5 6-3v-5M22 9v6"/>',
    'school': '<path d="M3 21V10l9-6 9 6v11"/><path d="M9 21v-6h6v6M3 21h18"/>',
    'ruler': '<path d="M3 17 17 3l4 4L7 21Z"/><path d="m7 13 2 2M10 10l2 2M13 7l2 2"/>',
    'calculator': '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 7h6M9 12h.01M12 12h.01M15 12h.01M9 16h.01M12 16h.01M15 16h.01"/>',
    'folder': '<path d="M3 7a2 2 0 0 1 2-2h4.2l2 2.4H19a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>',
    'folder-open': '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v1"/><path d="M3 19h14.5a2 2 0 0 0 1.9-1.4L22 11H7l-4 8Z"/><path d="M3 19V7"/>',
    'archive': '<rect x="3" y="4" width="18" height="5" rx="1"/><path d="M5 9v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9M10 13h4"/>',
    'clipboard': '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4a3 3 0 0 1 6 0M9 11h6M9 15h4"/>',
    'paperclip': '<path d="m20 11-8.5 8.5a5 5 0 0 1-7-7L13 4a3.3 3.3 0 0 1 4.7 4.7L9.5 17a1.7 1.7 0 0 1-2.4-2.4L15 6.7"/>',
    'bookmark': '<path d="M6 3h12v18l-6-4-6 4Z"/>',
    'file-text': '<path d="M6 3h8l4 4v14H6Z"/><path d="M14 3v4h4M9 12h6M9 16h4"/>',
    'layers': '<path d="m12 3 9 5-9 5-9-5Z"/><path d="m3 13 9 5 9-5M3 17l9 5 9-5"/>',
    'chart-bar': '<path d="M5 20v-7M11 20V5M17 20v-10M3 20h18"/>',
    'chart-line': '<path d="M4 4v16h16"/><path d="m7 15 4-5 3 3 6-7"/>',
    'receipt': '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2Z"/><path d="M9 8h6M9 12h6"/>',
    'tag': '<path d="M3 3h8l10 10-8 8L3 11Z"/><circle cx="8" cy="8" r="1.5"/>',
    /* droit */
    'scale': '<path d="M12 3v18M5 21h14M6 7l6-2 6 2M4 7h4M16 7h4"/><path d="m6 7-3 7a3 3 0 0 0 6 0L6 7ZM18 7l-3 7a3 3 0 0 0 6 0L18 7Z"/>',
    'landmark': '<path d="M3 21h18M5 18v-8M9 18v-8M15 18v-8M19 18v-8M2 10l10-6 10 6Z"/>',
    'scroll': '<path d="M6 3h12a2 2 0 0 1 2 2v12H8v2a2 2 0 0 1-4 0V5a2 2 0 0 1 2-2Z"/><path d="M6 21h12a2 2 0 0 0 2-2M10 8h6M10 12h6"/>',
    'lock': '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    'gavel': '<path d="m13 5 6 6M9 9l6 6M3 21l8-8M14 4l-8 8 2 2 8-8Z"/>',
    'vote': '<rect x="3" y="13" width="18" height="7" rx="1"/><path d="M7 13V5h10v8M9.5 9l2 2 3-4"/>',
    'shield': '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6Z"/>',
    'shield-check': '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6Z"/><path d="m9 12 2 2 4-4"/>',
    'users': '<circle cx="9" cy="8" r="3.5"/><path d="M2 20a7 7 0 0 1 14 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M22 20a7 7 0 0 0-5-6.7"/>',
    'feather': '<path d="M20 4c-5 0-10 3-12 8l-4 8 8-4c5-2 8-7 8-12Z"/><path d="M4 20 14 10"/>',
    'flag': '<path d="M5 21V4"/><path d="M5 4h12l-2 4 2 4H5"/>',
    'key': '<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M17 6l3 3M14 9l2 2"/>',
    /* économie */
    'coins': '<ellipse cx="9" cy="6" rx="6" ry="3"/><path d="M3 6v5c0 1.7 2.7 3 6 3s6-1.3 6-3V6M3 11v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5"/><path d="M17 9c2.4.4 4 1.5 4 2.8v5.4c0 1.3-1.6 2.4-4 2.8"/>',
    'banknote': '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/>',
    'euro': '<path d="M18 6.5A7 7 0 0 0 6 12a7 7 0 0 0 12 5.5M3 10h10M3 14h10"/>',
    'trending-up': '<path d="m3 17 6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
    'chart-down': '<path d="M4 4v16h16"/><path d="m7 8 4 5 3-3 6 7"/>',
    'factory': '<path d="M3 21V10l5 3v-3l5 3v-3l5 3V4h3v17Z"/><path d="M7 17h2M12 17h2M17 17h2"/>',
    'cart': '<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l2.5 12h11l2-8H6"/>',
    'credit-card': '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h4"/>',
    'package': '<path d="M12 3 3 7.5v9L12 21l9-4.5v-9Z"/><path d="M3 7.5 12 12l9-4.5M12 12v9"/>',
    'truck': '<path d="M2 6h12v10H2ZM14 10h4l3 3v3h-7"/><circle cx="6" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>',
    'globe': '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
    'building': '<rect x="4" y="3" width="16" height="18" rx="1"/><path d="M8 7h2M14 7h2M8 11h2M14 11h2M8 15h2M14 15h2M10 21v-3h4v3"/>',
    'briefcase': '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 12h18"/>',
    'percent': '<path d="M19 5 5 19"/><circle cx="7" cy="7" r="2.5"/><circle cx="17" cy="17" r="2.5"/>',
    'wheat': '<path d="M12 22V8"/><path d="M12 8c-3 0-4-2-4-5 3 0 4 2 4 5Zm0 0c3 0 4-2 4-5-3 0-4 2-4 5ZM12 13c-3 0-4-2-4-5 3 0 4 2 4 5Zm0 0c3 0 4-2 4-5-3 0-4 2-4 5ZM12 18c-3 0-4-2-4-5 3 0 4 2 4 5Zm0 0c3 0 4-2 4-5-3 0-4 2-4 5Z"/>',
    /* sciences & maths */
    'microscope': '<path d="M9 3h4v5a2 2 0 0 1-4 0Z"/><path d="M11 10v4M7 14h8M14 22a7 7 0 0 0 3-13M4 22h16"/>',
    'flask': '<path d="M9 3h6M10 3v6l-5.5 9.5A2 2 0 0 0 6.2 21h11.6a2 2 0 0 0 1.7-2.5L14 9V3"/><path d="M7.5 15h9"/>',
    'dna': '<path d="M7 3c0 5 10 7 10 12M17 3c0 5-10 7-10 12M7 21c0-3 2-4 5-5M17 21c0-3-2-4-5-5M8 8h8M8 16h8"/>',
    'telescope': '<path d="m4 13 13-7 2 4-13 7Z"/><path d="M9 15v6M9 21l-3-5M9 21l3-5M17 6l2-1 2 4-2 1"/>',
    'magnet': '<path d="M6 3v8a6 6 0 0 0 12 0V3h-4v8a2 2 0 0 1-4 0V3Z"/><path d="M6 7h4M14 7h4"/>',
    'atom': '<circle cx="12" cy="12" r="1.5"/><ellipse cx="12" cy="12" rx="9" ry="3.5"/><ellipse cx="12" cy="12" rx="9" ry="3.5" transform="rotate(60 12 12)"/><ellipse cx="12" cy="12" rx="9" ry="3.5" transform="rotate(120 12 12)"/>',
    'battery': '<rect x="2" y="7" width="17" height="10" rx="2"/><path d="M22 10v4M6 11v2M10 11v2"/>',
    'lightbulb': '<path d="M9 18h6M10 21h4M8 13a5.5 5.5 0 1 1 8 0c-1 1-1.5 2-1.5 3h-5c0-1-.5-2-1.5-3Z"/>',
    'brain': '<path d="M9 3a3 3 0 0 0-3 3v1a3 3 0 0 0-2 5 3 3 0 0 0 2 5v1a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3ZM15 3a3 3 0 0 1 3 3v1a3 3 0 0 1 2 5 3 3 0 0 1-2 5v1a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3Z"/>',
    'thermometer': '<path d="M10 4a2 2 0 0 1 4 0v9.5a4 4 0 1 1-4 0Z"/><path d="M12 10v6"/>',
    'leaf': '<path d="M4 20C4 10 10 4 20 4c0 10-6 16-16 16Z"/><path d="M4 20c3-5 7-9 12-12"/>',
    'bug': '<circle cx="12" cy="12" r="5"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5M5 5l3.5 3.5M15.5 15.5 19 19M19 5l-3.5 3.5M8.5 15.5 5 19"/>',
    'snowflake': '<path d="M12 2v20M2 12h20M5 5l14 14M19 5 5 19"/>',
    'planet': '<circle cx="12" cy="12" r="5"/><ellipse cx="12" cy="12" rx="10" ry="3" transform="rotate(-25 12 12)"/>',
    'mountain': '<path d="m3 20 6-11 4 6 3-4 5 9Z"/>',
    'compass': '<circle cx="12" cy="12" r="9"/><path d="m15 9-2 5-4 2 2-5Z"/>',
    'sigma': '<path d="M18 5H6l6 7-6 7h12"/>',
    'pi': '<path d="M4 7h16M8 7v12M16 7v12"/>',
    'infinity': '<path d="M12 12c-2-3-4-4-6-4a4 4 0 0 0 0 8c2 0 4-1 6-4s4-4 6-4a4 4 0 0 1 0 8c-2 0-4-1-6-4Z"/>',
    'function': '<path d="M15 4c-3 0-3 3-4 8s-1 8-4 8M6 12h8"/><path d="m14 15 4 5M18 15l-4 5"/>',
    /* lettres, langues, médias */
    'languages': '<path d="M3 5h10M8 3v2c0 4-2 7-5 9M6 8c1 3 3 5 6 6"/><path d="m13 21 4-9 4 9M14.5 18h5"/>',
    'message-circle': '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.5A8 8 0 1 1 21 12Z"/>',
    'quote': '<path d="M6 11h4v5H7a3 3 0 0 1-3-3c0-3 1-5 4-6M15 11h4v5h-3a3 3 0 0 1-3-3c0-3 1-5 4-6"/>',
    'newspaper': '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 8h6v4H7ZM15 8h3M15 12h3M7 16h11"/>',
    'megaphone': '<path d="M3 11v2a1 1 0 0 0 1 1h3l7 4V6l-7 4H4a1 1 0 0 0-1 1Z"/><path d="M18 9a4 4 0 0 1 0 6M7 14v5h3v-4"/>',
    'film': '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4"/>',
    'mic': '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
    'camera': '<path d="M4 8h3l2-3h6l2 3h3v12H4Z"/><circle cx="12" cy="13" r="3.5"/>',
    'music': '<path d="M9 18V6l11-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>',
    'palette': '<path d="M12 3a9 9 0 0 0 0 18c1.5 0 2-1 2-2s-1-1.5-1-2.5 1-1.5 2-1.5h2a4 4 0 0 0 4-4c0-4.4-4-8-9-8Z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7.5" r="1"/><circle cx="14.5" cy="7.5" r="1"/>',
    /* divers */
    'star': '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1L3.2 9.5l6.1-.9Z"/>',
    'heart': '<path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10Z"/>',
    'flame': '<path d="M12 22c4 0 7-3 7-7 0-3-2-5-3-7-1 2-2 3-3 3 0-3-1-6-3-8-1 4-5 6-5 12a7 7 0 0 0 7 7Z"/>',
    'check-circle': '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
    'pin': '<path d="M12 17v5M9 3h6l1 7 2.5 3h-13L8 10Z"/>',
    'target': '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
    'trophy': '<path d="M8 4h8v6a4 4 0 0 1-8 0Z"/><path d="M8 6H5a3 3 0 0 0 3 5M16 6h3a3 3 0 0 1-3 5M12 14v4M8 21h8M9 18h6"/>',
    'rocket': '<path d="M12 3c3 2 5 6 5 10l-5 4-5-4c0-4 2-8 5-10Z"/><circle cx="12" cy="10" r="1.5"/><path d="M7 13 4 16l3 1M17 13l3 3-3 1M10 19c0 1 .7 2 2 3 1.3-1 2-2 2-3"/>',
    'zap': '<path d="M13 2 4 14h7l-1 8 9-12h-7Z"/>',
    'sparkles': '<path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8Z"/><path d="m19 16 .8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8Z"/>',
    'puzzle': '<path d="M10 3a2 2 0 0 1 2 2v1h4v4h1a2 2 0 1 1 0 4h-1v4h-4v1a2 2 0 1 1-4 0v-1H4v-4h1a2 2 0 1 0 0-4H4V6h4V5a2 2 0 0 1 2-2Z"/>',
    'map': '<path d="m3 6 6-2 6 2 6-2v14l-6 2-6-2-6 2Z"/><path d="M9 4v14M15 6v14"/>',
    'clock': '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    'calendar': '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    'home': '<path d="M4 11 12 4l8 7M6 10v9h12v-9"/>',
    'gift': '<rect x="3" y="8" width="18" height="4"/><path d="M5 12v9h14v-9M12 8v13"/><path d="M12 8c-2 0-4-1-4-3a2 2 0 0 1 4 0 2 2 0 0 1 4 0c0 2-2 3-4 3Z"/>',
    'coffee': '<path d="M5 9h11v6a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4Z"/><path d="M16 10h2a2 2 0 0 1 0 4h-2M7 5v1M10 4v2M13 5v1"/>',
    'apple': '<path d="M12 7c-2-1-5 0-5 4 0 4 2 8 4 8 1 0 1-.5 1-.5s0 .5 1 .5c2 0 4-4 4-8 0-4-3-5-5-4Z"/><path d="M12 7c0-2 1-3 3-3"/>',
    'paw': '<circle cx="8" cy="8" r="1.8"/><circle cx="16" cy="8" r="1.8"/><circle cx="5" cy="12.5" r="1.6"/><circle cx="19" cy="12.5" r="1.6"/><path d="M12 12c-3 0-5 3-5 5.5S9 20 12 20s5-.5 5-2.5S15 12 12 12Z"/>',
    'flower': '<circle cx="12" cy="12" r="2.5"/><path d="M12 2.5a3.5 3.5 0 0 1 0 7 3.5 3.5 0 0 1 0-7ZM12 14.5a3.5 3.5 0 0 1 0 7 3.5 3.5 0 0 1 0-7ZM2.5 12a3.5 3.5 0 0 1 7 0 3.5 3.5 0 0 1-7 0ZM14.5 12a3.5 3.5 0 0 1 7 0 3.5 3.5 0 0 1-7 0Z"/>',
    'sun': '<circle cx="12" cy="12" r="4"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M19.1 4.9l-1.8 1.8M6.7 17.3l-1.8 1.8"/>',
    'moon': '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z"/>',
    'bell': '<path d="M6 16v-5a6 6 0 0 1 12 0v5l2 2H4Z"/><path d="M10 21h4"/>',
    'user': '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    'activity': '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
    'settings': '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1"/>',
    /* interface */
    'list': '<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>',
    'heading': '<path d="M5 4v16M19 4v16M5 12h14"/>',
    'search': '<circle cx="11" cy="11" r="7"/><path d="m16.5 16.5 4.5 4.5"/>',
    'check': '<path d="m4 12 5 5L20 6"/>',
    'x': '<path d="M6 6l12 12M18 6 6 18"/>',
    'link': '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    'equal': '<path d="M5 9h14M5 15h14"/>',
    'wave': '<path d="M3 12c2-5 4-5 6 0s4 5 6 0 4-5 6 0"/>'
  };

  const CATEGORIES = {
    'Études': ['book', 'book-open', 'pencil', 'pen-line', 'graduation-cap', 'school', 'ruler', 'calculator', 'folder', 'folder-open', 'archive', 'clipboard', 'paperclip', 'bookmark', 'file-text', 'layers', 'chart-bar', 'chart-line', 'receipt', 'tag'],
    'Droit': ['scale', 'landmark', 'scroll', 'lock', 'gavel', 'vote', 'shield', 'shield-check', 'users', 'feather', 'flag', 'key'],
    'Économie': ['coins', 'banknote', 'euro', 'trending-up', 'chart-down', 'factory', 'cart', 'credit-card', 'package', 'truck', 'globe', 'building', 'briefcase', 'percent', 'wheat'],
    'Sciences & maths': ['microscope', 'flask', 'dna', 'telescope', 'magnet', 'atom', 'battery', 'lightbulb', 'brain', 'thermometer', 'leaf', 'bug', 'snowflake', 'planet', 'mountain', 'compass', 'sigma', 'pi', 'infinity', 'function'],
    'Lettres & médias': ['languages', 'message-circle', 'quote', 'newspaper', 'megaphone', 'film', 'mic', 'camera', 'music', 'palette'],
    'Divers': ['star', 'heart', 'flame', 'check-circle', 'pin', 'target', 'trophy', 'rocket', 'zap', 'sparkles', 'puzzle', 'map', 'clock', 'calendar', 'home', 'gift', 'coffee', 'apple', 'paw', 'flower', 'sun', 'moon', 'bell', 'user', 'activity', 'settings']
  };

  /* anciens émojis de dossiers → icônes équivalentes */
  const EMOJI_MAP = {
    '⚖️': 'scale', '📚': 'book', '📖': 'book-open', '📝': 'pencil', '🎓': 'graduation-cap', '✏️': 'pencil', '📐': 'ruler', '📏': 'ruler',
    '🧮': 'calculator', '🗂️': 'archive', '📁': 'folder', '📂': 'folder-open', '📊': 'chart-bar', '📈': 'trending-up', '📉': 'chart-down',
    '🧾': 'receipt', '📋': 'clipboard', '📎': 'paperclip', '🔖': 'bookmark', '🏫': 'school', '🏛️': 'landmark', '📜': 'scroll', '🔏': 'lock',
    '🔒': 'lock', '🔨': 'gavel', '🗳️': 'vote', '🛡️': 'shield', '🤝': 'users', '🖋️': 'feather', '🏷️': 'tag', '💰': 'coins', '💶': 'euro',
    '💵': 'banknote', '💹': 'trending-up', '🏦': 'landmark', '🏭': 'factory', '🛒': 'cart', '💳': 'credit-card', '📦': 'package', '🚚': 'truck',
    '🌍': 'globe', '🏙️': 'building', '🧑‍💼': 'briefcase', '⚙️': 'settings', '🌾': 'wheat', '🔬': 'microscope', '🧪': 'flask', '🧬': 'dna',
    '🔭': 'telescope', '🧲': 'magnet', '⚛️': 'atom', '🔋': 'battery', '💡': 'lightbulb', '🧠': 'brain', '🌡️': 'thermometer', '🌱': 'leaf',
    '🦠': 'bug', '🧊': 'snowflake', '🪐': 'planet', '🌋': 'mountain', '🧭': 'compass', '🗣️': 'languages', '💬': 'message-circle', '✍️': 'pen-line',
    '📰': 'newspaper', '📣': 'megaphone', '🎬': 'film', '⭐': 'star', '❤️': 'heart', '🔥': 'flame', '✅': 'check-circle', '📌': 'pin',
    '🎯': 'target', '🏆': 'trophy', '🚀': 'rocket', '🎨': 'palette', '🎵': 'music', '🏃': 'activity', '🍀': 'flower', '🌙': 'moon', '☀️': 'sun',
    '⚡': 'zap', '🔑': 'key', '🧩': 'puzzle', '🗺️': 'map', '🕰️': 'clock', '📅': 'calendar', '🏠': 'home', '🎁': 'gift', '☕': 'coffee',
    '🍎': 'apple', '🐱': 'paw', '🐶': 'paw', '🦊': 'paw', '🌸': 'flower', '🏔️': 'mountain'
  };

  function svg(name, cls = '') {
    const body = ICONS[name] || ICONS.folder;
    return `<svg class="ico ${cls}" viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;
  }

  window.AlixoIcons = { ICONS, CATEGORIES, EMOJI_MAP, svg };
})();
