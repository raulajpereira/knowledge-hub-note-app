import type { ApiFailure } from '@/lib/client/api';

/** Maps an API error to the message shown in the auth card. */
export function authErrorMessage(e: ApiFailure, t: (k: string) => string): string {
  switch (e.code) {
    case 'bad_credentials':
      return t('login_bad');
    case 'locked':
      return t('login_wait').replace('{s}', String(e.retryAfter ?? 30));
    case 'unverified':
      return t('auth_unverified');
    case 'user_paused':
    case 'code_paused':
    case 'tenant_canceled':
      return t('auth_accessPaused');
    case 'user_disabled':
    case 'code_revoked':
    case 'tenant_deleted':
      return t('auth_accessRevoked');
    case 'code_invalid':
      return t('auth_codeInvalid');
    case 'code_expired':
      return t('auth_codeExpired');
    case 'code_used_up':
      return t('auth_codeUsedUp');
    case 'code_no_seats':
      return t('auth_codeNoSeats');
    case 'email_taken':
      return t('auth_emailTaken');
    case 'password_pwned':
      return t('auth_pwned');
    case 'password_too_short':
      return t('reg_ePw');
    case 'password_same':
      return t('reset_eSame');
    case 'bad_2fa_code':
      return t('auth_2faBad');
    case 'challenge_expired':
      return t('auth_2faExpired');
    case 'too_many_requests':
      return t('auth_tooMany');
    default:
      return t('auth_generic');
  }
}
