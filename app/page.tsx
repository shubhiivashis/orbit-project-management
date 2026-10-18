import { requireUser } from "./auth";
import WorkspaceApp from "./workspace-app";
export const dynamic = "force-dynamic";
export default async function Home() {
  const user = await requireUser();
  return (
    <WorkspaceApp
      user={{
        id: user.userId,
        name: user.fullName ?? user.email.split("@")[0],
        email: user.email,
      }}
    />
  );
}
