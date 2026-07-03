import { Role } from '@prisma/client';
export { Role };
export const formEditors = [Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGER, Role.CONTRIBUTOR];
export const formReaders = [...formEditors, Role.VIEWER, Role.AUDITOR];
