import { makeSpacesService } from "./spacesServiceFactory";

export const spacesService = makeSpacesService("/spaces");

export const listSpaces = spacesService.listSpaces;
export const getSpace = spacesService.getSpace;
export const createSpace = spacesService.createSpace;
export const updateSpace = spacesService.updateSpace;
export const deleteSpace = spacesService.deleteSpace;
export const listDocuments = spacesService.listDocuments;
export const uploadDocument = spacesService.uploadDocument;
export const deleteDocument = spacesService.deleteDocument;
export const getSpaceSharing = spacesService.getSpaceSharing;
export const shareSpace = spacesService.shareSpace;
export const removeSpaceSharing = spacesService.removeSpaceSharing;
