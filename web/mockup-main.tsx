import "@mantine/core/styles.css";
import { MantineProvider } from "@mantine/core";
import { createRoot } from "react-dom/client";
import { MeetingTypeFilterMockup } from "./MeetingTypeFilterMockup.tsx";

const root = document.getElementById("root");
if (!root) throw new Error("Root element not found");

createRoot(root).render(
  <MantineProvider defaultColorScheme="light">
    <MeetingTypeFilterMockup />
  </MantineProvider>,
);
