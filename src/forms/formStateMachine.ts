export const submissionStates = ['DRAFT', 'PENDING_VERIFICATION', 'SUBMITTED'] as const;
export type SubmissionState = (typeof submissionStates)[number];

export function nextSubmissionState(
  current: SubmissionState,
  event: 'submit' | 'verify',
  requiresVerification = false,
): SubmissionState {
  if (current === 'DRAFT' && event === 'submit')
    return requiresVerification ? 'PENDING_VERIFICATION' : 'SUBMITTED';
  if (current === 'PENDING_VERIFICATION' && event === 'verify') return 'SUBMITTED';
  throw new Error(`Invalid submission transition: ${current} -> ${event}`);
}
