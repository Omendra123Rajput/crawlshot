import path from 'path';
import { MAX_FILENAME_LENGTH } from '@screenshot-crawler/utils';

export function sanitizeFilename(url: string): string {
  try {
    const parsed = new URL(url);
    let pathname = parsed.pathname;

    // Handle root path
    if (pathname === '/' || pathname === '') {
      return 'homepage.png';
    }

    // Remove leading/trailing slashes
    pathname = pathname.replace(/^\/|\/$/g, '');

    // Replace slashes with underscores
    let filename = pathname.replace(/\//g, '_');

    // Remove all characters except alphanumeric, underscore, hyphen
    filename = filename.replace(/[^a-zA-Z0-9_\-]/g, '');

    // Handle empty result
    if (!filename) {
      return 'homepage.png';
    }

    // Truncate to max length (minus .png extension)
    if (filename.length > MAX_FILENAME_LENGTH) {
      filename = filename.slice(0, MAX_FILENAME_LENGTH);
    }

    return `${filename}.png`;
  } catch {
    return 'unknown.png';
  }
}

export function safePath(basePath: string, ...segments: string[]): string {
  const resolved = path.resolve(basePath, ...segments);

  // Ensure resolved path stays within basePath to prevent path traversal
  if (!resolved.startsWith(path.resolve(basePath))) {
    throw new Error(`Path traversal detected: ${resolved} is outside ${basePath}`);
  }

  return resolved;
}
