import type { Route } from "./+types/home";
import { Welcome } from "../welcome/welcome";

export function meta() {
  return [
    { title: "Align - バリューカードゲーム" },
    { name: "description", content: "Align バリューカードゲームへようこそ" },
  ];
}

export function loader() {
  return { message: "Align へようこそ" };
}

export default function Home({ loaderData }: Route.ComponentProps) {
  return <Welcome message={loaderData.message} />;
}
