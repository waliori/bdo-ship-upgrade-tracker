// Starts the app. A file rather than an inline <script> so the page can
// carry a Content-Security-Policy that does not have to allow inline
// script -- which is most of what a CSP is for.
import { init } from './ui.js';

init();
