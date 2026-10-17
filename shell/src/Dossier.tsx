import { CourseWorkspace, type CourseWorkspaceProps } from './courses/CourseWorkspace';

export function Dossier(props: CourseWorkspaceProps) {
  return <CourseWorkspace {...props} />;
}

export default Dossier;
