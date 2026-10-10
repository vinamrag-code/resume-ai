/** The small part of Google Identity Services that we use. */
interface GoogleIdApi {
  initialize(config: { client_id: string; callback: (response: { credential: string }) => void; auto_select?: boolean; cancel_on_tap_outside?: boolean }): void
  renderButton(el: HTMLElement, options: { theme?: 'outline' | 'filled_blue' | 'filled_black'; size?: 'large' | 'medium' | 'small'; text?: 'signin_with' | 'continue_with'; shape?: 'pill' | 'rectangular'; width?: number }): void
}
interface Window {
  google?: { accounts: { id: GoogleIdApi } }
}
