/** What a feature plugin may ask of the editor it runs in; given before the view exists. `zoom` is the factor (1 at 100 %). */
export interface EditorPluginHost {
  layer(): HTMLElement | null;
  zoom(): number;
  setScenesNumbered(on: boolean): void;
}
