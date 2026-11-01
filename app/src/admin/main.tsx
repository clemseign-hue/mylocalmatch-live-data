import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/bebas-neue/400.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/600.css';
import '../index.css';
import { Admin } from './Admin';

createRoot(document.getElementById('root')!).render(<StrictMode><Admin /></StrictMode>);
