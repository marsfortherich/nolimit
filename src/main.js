import { attach } from './ui.js';

// Start at the title screen; the screen itself offers "Continue" when a save
// is on disk, so a stray refresh never drops you into the wrong run.
attach(null);
