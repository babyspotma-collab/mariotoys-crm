// Constantes d'upload partagées navigateur / serveur (module pur : pas de
// dépendance serveur, importable depuis un composant client).
export const MAX_SOURCE_PHOTO_BYTES = 10 * 1024 * 1024;
export const SOURCE_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const UPLOAD_PATH_PREFIX = "creatives/uploads/";
