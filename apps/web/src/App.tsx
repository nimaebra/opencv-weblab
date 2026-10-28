import { useWorkspaceController } from './useWorkspaceController';
import { AppHeader } from './AppHeader';
import { Workspace } from './Workspace';
import { StatusBar } from './StatusBar';
import { AssetInputs } from './AssetInputs';
import { ExportDialog } from './ExportDialog';
import { ProjectsDialog } from './ProjectsDialog';
import { CloudDialog } from './CloudDialog';
export default function App() {
  const controller = useWorkspaceController();
  return (
    <>
      <AppHeader controller={controller} />
      <Workspace controller={controller} />
      <StatusBar controller={controller} />
      <AssetInputs controller={controller} />
      <ExportDialog controller={controller} />
      <ProjectsDialog controller={controller} />
      <CloudDialog controller={controller} />
    </>
  );
}
