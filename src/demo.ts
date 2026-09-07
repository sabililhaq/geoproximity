import { mountProximity } from "./index";

const themeQuery = window.matchMedia("(prefers-color-scheme: dark)");
const applyTheme = () => {
  document.documentElement.dataset.theme = themeQuery.matches ? "dark" : "light";
};
applyTheme();
themeQuery.addEventListener("change", applyTheme);

const app = document.getElementById("app");
if (!app) throw new Error("Missing #app");

mountProximity(app, { basePath: "/", sample: true, share: true });
