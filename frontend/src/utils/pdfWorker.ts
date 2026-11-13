import {pdfjs} from 'react-pdf'

// Der Worker kommt aus genau dem pdfjs-dist, das react-pdf selbst verwendet (Alias in
// vite.config.ts), und wird von Vite mit Hash ausgeliefert.
// `new URL(…, import.meta.url)` statt `?url`: Der Dev-Server hält ein `?url`-Modul aus node_modules für eine vor-gebündelte Abhängigkeit ohne
// Datei auf der Platte und antwortete mit 404. Eine von Hand nach public/ kopierte
// Fassung blieb bei einem Update von react-pdf stehen, und der Vorlagen-Editor blieb dann mit
// „API version does not match Worker version" leer.
// Importiert wird diese Datei nur vom PDF-Editor, der Worker landet also nicht im Hauptbündel.
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
).toString()
