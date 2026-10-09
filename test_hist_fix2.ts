import { parseToc, chaptersFromToc } from './apps/web/src/lib/toc';

const fullToc = `Unit
Development of Capitalism and Nationalism 1815-1914 ...................1
1.1. Features of Capitalism ........................................................................................2`;

const parsed = parseToc(fullToc);
console.log('Count:', parsed.length);
parsed.forEach(p => console.log(p));
