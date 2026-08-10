import { Component, computed, input } from '@angular/core';

/**
 * Tone of the message. Not a styling knob - it changes how the message is announced.
 */
export type AlertTone = 'error' | 'success' | 'info';

/**
 * An inline message: a failed submission, a confirmation, a note.
 *
 * Not a notification system. There is no queue, no timeout, no positioning and no
 * global service - it renders where it is placed. If overlay notifications are ever
 * genuinely needed, that is a different thing and should be built as one.
 *
 * `tone` is deliberately the only input, and it earns its place by driving the ARIA
 * role rather than just the colour: errors interrupt with `role="alert"`, while
 * success and info wait their turn with `role="status"`.
 */
@Component({
  selector: 'app-alert',
  template: `
    <div [attr.role]="role()" class="rounded-md border p-3 text-sm" [class]="toneClasses()">
      <ng-content />
    </div>
  `,
})
export class Alert {
  readonly tone = input<AlertTone>('info');

  /** Errors interrupt the screen reader; everything else is announced politely. */
  protected readonly role = computed(() => (this.tone() === 'error' ? 'alert' : 'status'));

  protected readonly toneClasses = computed(() => {
    switch (this.tone()) {
      case 'error':
        return 'border-red-200 bg-red-50 text-red-900';
      case 'success':
        return 'border-green-200 bg-green-50 text-green-900';
      default:
        return 'border-slate-200 bg-slate-50 text-slate-900';
    }
  });
}
