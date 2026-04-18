export type AuthenticatedViewer = {
  userId: string;
  email?: string;
  isPlatformAdmin?: boolean;
};

export function toViewerResponse(viewer: AuthenticatedViewer) {
  return viewer.email
    ? { id: viewer.userId, email: viewer.email, isPlatformAdmin: viewer.isPlatformAdmin ?? false }
    : { id: viewer.userId, isPlatformAdmin: viewer.isPlatformAdmin ?? false };
}
