import { getMimeTypeFromFileName } from '../../../app/utils/lib/mimeTypes';

/** MIME type of a file an app uploads, judged by its name. */
export const determineFileType = (_buffer: Buffer, fileName: string): string => getMimeTypeFromFileName(fileName);
