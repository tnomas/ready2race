import {pdfjs} from 'react-pdf'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

// Der Worker kommt aus genau dem pdfjs-dist, das react-pdf selbst verwendet (Alias in
// vite.config.ts), und wird von Vite mit Hash ausgeliefert. Eine von Hand nach public/ kopierte
// Fassung blieb bei einem Update von react-pdf stehen, und der Vorlagen-Editor blieb dann mit
// „API version does not match Worker version" leer.
// Importiert wird diese Datei nur vom PDF-Editor, der Worker landet also nicht im Hauptbündel.
pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
