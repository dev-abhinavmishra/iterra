import { TodayWorkspace, type TodayWorkspaceProps } from './today/TodayWorkspace';

export function Terrain(props: TodayWorkspaceProps) {
  return <TodayWorkspace {...props} />;
}

export default Terrain;
