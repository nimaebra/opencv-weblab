import type { WorkspaceController } from './useWorkspaceController';
export function AssetInputs({ controller }: { controller: WorkspaceController }) {
  const { reconnectNode, addImages, importJson } = controller;

  return (
    <>
      <input
        id="reconnect-input"
        type="file"
        accept="image/png,image/jpeg,image/webp"
        hidden
        onChange={(e) => {
          void addImages(e.target.files, reconnectNode.current);
          reconnectNode.current = null;
          e.target.value = '';
        }}
      />
      <input
        id="image-input"
        data-testid="image-input"
        type="file"
        accept="image/png,image/jpeg,image/webp"
        multiple
        hidden
        onChange={(e) => {
          void addImages(e.target.files);
          e.target.value = '';
        }}
      />
      <input
        id="json-input"
        type="file"
        accept="application/json,.json"
        hidden
        onChange={(e) => {
          void importJson(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
    </>
  );
}
