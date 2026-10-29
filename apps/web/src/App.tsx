import { useWorkspaceController } from './useWorkspaceController';
import { AppHeader } from './AppHeader';
import { Workspace } from './Workspace';
import { StatusBar } from './StatusBar';
import { AssetInputs } from './AssetInputs';
import { ExportDialog } from './ExportDialog';
import { ProjectsDialog } from './ProjectsDialog';
import { OfflineNotice } from './OfflineNotice';
export default function App() {
  const controller = useWorkspaceController();
  return (
    <>
      <a
        className="skip-link"
        href="#workspace-content"
        onClick={() => controller.setPanel('workspace')}
      >
        Skip to workspace
      </a>
      <AppHeader controller={controller} />
      <Workspace controller={controller} />
      <StatusBar controller={controller} />
      <AssetInputs controller={controller} />
      <ExportDialog controller={controller} />
      <ProjectsDialog controller={controller} />
      <OfflineNotice controller={controller} />
    </>
  );
}
