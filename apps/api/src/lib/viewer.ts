export type AuthenticatedViewer = {
  userId: string;
  email?: string;
};

export function toViewerResponse(viewer: AuthenticatedViewer) {
  return viewer.email
    ? { id: viewer.userId, email: viewer.email }
    : { id: viewer.userId };
}
