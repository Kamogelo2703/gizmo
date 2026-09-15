import { useApp } from "./store.jsx";

/** Header that lives inside the scrollable stage so the mentor name scrolls away. */
export default function TopBar() {
  const { mainTextDisplay } = useApp();

  return (
    <header className="top">
      <p className="username" id="username">
        {mainTextDisplay || ""}
      </p>
    </header>
  );
}
