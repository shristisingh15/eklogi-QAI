// frontend/src/context/ProjectContext.tsx
import React, {
  createContext,
  useContext,
  useState,
  ReactNode,
  Dispatch,
  SetStateAction,
  useCallback,
  useMemo,
} from "react";

export type UploadedFile = {
  _id?: string;
  filename: string;
  url?: string;
  mimeType?: string;
  version?: string;
  uploadedAt?: string; // ISO string recommended
};

export type Scenario = {
  _id?: string;
  title: string;
  description?: string;
  steps?: string[];
  expected_result?: string;
  fileId?: string;
  createdAt?: string; // ISO string recommended
  priority?: "low" | "medium" | "high" | number;
};

// New: test run config shape
export type TestRunConfig = {
  framework: string | null;
  language: string | null;
  scenarios: Scenario[];
  uploadedFiles: UploadedFile[];
  code?: string | null;
  codes?: { scenarioID: string; title:string; code:string }[];
};

type ProjectContextType = {
  projectId: string | null;
  projectName: string | null;
  uploadedFiles: UploadedFile[];
  scenarios: Scenario[]; // list of scenarios in context (selected / current)
  selectedScenario: Scenario | null;

  // setters
  setProject: (id?: string | null, name?: string | null) => void;
  setUploadedFiles: Dispatch<SetStateAction<UploadedFile[]>>;
  setScenarios: Dispatch<SetStateAction<Scenario[]>>;
  selectScenario: Dispatch<SetStateAction<Scenario | null>>;

  // test run config: can be null if not configured
  testRunConfig: TestRunConfig | null;
  setTestRunConfig: Dispatch<SetStateAction<TestRunConfig | null>>;
};

const ProjectContext = createContext<ProjectContextType | undefined>(undefined);

export const useProject = () => {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error("useProject must be used within ProjectProvider");
  return ctx;
};

export const ProjectProvider = ({ children }: { children: ReactNode }) => {
  const [projectId, setProjectId] = useState<string | null>(null);
  const [projectName, setProjectName] = useState<string | null>(null);
  const [uploadedFiles, setUploadedFilesState] = useState<UploadedFile[]>([]);
  const [scenarios, setScenariosState] = useState<Scenario[]>([]);
  const [selectedScenario, setSelectedScenario] = useState<Scenario | null>(null);

  // Test run config state (correctly typed)
  const [testRunConfig, setTestRunConfig] = useState<TestRunConfig | null>(null);

  // normalize undefined → null
  const setProject = useCallback((id?: string | null, name?: string | null) => {
    setProjectId(id ?? null);
    setProjectName(name ?? null);
  }, []);

  // Memoize the value so consumers only re-render when relevant parts change.
  const value = useMemo(
    () => ({
      projectId,
      projectName,
      uploadedFiles,
      scenarios,
      selectedScenario,
      setProject,
      setUploadedFiles: setUploadedFilesState,
      setScenarios: setScenariosState,
      selectScenario: setSelectedScenario,
      testRunConfig,
      setTestRunConfig,
    }),
    [
      projectId,
      projectName,
      uploadedFiles,
      scenarios,
      selectedScenario,
      setProject,
      setUploadedFilesState,
      setScenariosState,
      setSelectedScenario,
      testRunConfig,
      setTestRunConfig,
    ]
  );

  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
};
