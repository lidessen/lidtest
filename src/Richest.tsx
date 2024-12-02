import {
  PropsWithChildren,
  createContext,
  useContext,
  useMemo,
  useRef,
  useState,
  useCallback,
  useEffect,
} from "react";
import { createStore, useStore } from "zustand";
import { nanoid } from "nanoid";
import { TestStatus } from "@/constants";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2,
  XCircle,
  Circle,
  LoaderCircle,
  PlayCircle,
  AlertCircle,
  CircleDashed,
  FlaskConical,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface Test {
  id: string;
  title: string;
  code: string;
  func?: string;
}

interface TestState {
  ws: WebSocket | null;
  tests: Array<{
    id: string;
    run: (ws: WebSocket) => Promise<void>;
  }>;
}

const createTestStore = () =>
  createStore<TestState>(() => ({
    ws: null,
    tests: [],
  }));

const TestStoreContext = createContext<ReturnType<
  typeof createTestStore
> | null>(null);

interface DescribeProps {
  title: string;
  server: string;
}

type ConnectionStatus = "disconnected" | "connected" | "error";

function StatusDot({ status }: { status: ConnectionStatus }) {
  const colors = {
    disconnected: "bg-gray-400",
    connected: "bg-green-500",
    error: "bg-red-500",
  };

  return (
    <div className="flex items-center gap-2">
      <div className={`w-2 h-2 rounded-full ${colors[status]}`} />
      <span className="text-sm text-muted-foreground">
        {status === "disconnected" && "Not Connected"}
        {status === "connected" && "Connected"}
        {status === "error" && "Connection Error"}
      </span>
    </div>
  );
}

export function Describe({
  title,
  server,
  children,
}: PropsWithChildren<DescribeProps>) {
  const store = useMemo(() => createTestStore(), []);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reconnectTimeout = useRef<number>();
  const ws = useRef<WebSocket>();

  const connectionStatus: ConnectionStatus = error
    ? "error"
    : connected
    ? "connected"
    : "disconnected";

  const connect = useCallback(() => {
    if (!server) {
      store.setState({ ws: null });
      setConnected(false);
      return;
    }

    try {
      if (ws.current?.readyState === WebSocket.OPEN) {
        ws.current.close();
      }

      const newWs = new WebSocket(server);
      ws.current = newWs;

      newWs.addEventListener("open", () => {
        store.setState({ ws: newWs });
        setConnected(true);
        setError(null);
      });

      newWs.addEventListener("error", () => {
        setError("Failed to connect to server");
        setConnected(false);
        store.setState({ ws: null });
        scheduleReconnect();
      });

      newWs.addEventListener("close", () => {
        setConnected(false);
        store.setState({ ws: null });
        scheduleReconnect();
      });
    } catch (err: unknown) {
      setError(`Failed to create WebSocket connection: ${err}`);
      setConnected(false);
      store.setState({ ws: null });
      scheduleReconnect();
    }
  }, [server, store]);

  const scheduleReconnect = useCallback(() => {
    if (reconnectTimeout.current) {
      clearTimeout(reconnectTimeout.current);
    }
    reconnectTimeout.current = window.setTimeout(() => {
      connect();
    }, 2000);
  }, [connect]);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimeout.current) {
        clearTimeout(reconnectTimeout.current);
      }
      if (ws.current) {
        ws.current.close();
      }
    };
  }, [connect]);

  const [isRunning, setIsRunning] = useState(false);

  const runAll = useCallback(async () => {
    setIsRunning(true);
    const tests = store.getState().tests;

    try {
      for (const test of tests) {
        await test.run(ws.current!);
      }
    } catch (error) {
      console.error("Test execution failed:", error);
    } finally {
      setIsRunning(false);
    }
  }, [store]);

  const stopAll = useCallback(() => {
    setIsRunning(false);
  }, []);

  return (
    <TestStoreContext.Provider value={store}>
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span>{title}</span>
              <StatusDot status={connectionStatus} />
            </div>
            <div className="flex items-center gap-2">
              {error && (
                <Badge
                  variant="destructive"
                  className="animate-fade-in"
                  title={error}
                >
                  {error.length > 50 ? `${error.slice(0, 50)}...` : error}
                </Badge>
              )}
              <Button
                variant={isRunning ? "secondary" : "default"}
                onClick={isRunning ? stopAll : runAll}
              >
                {isRunning ? "Stop" : "Run All"}
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">{children}</CardContent>
      </Card>
    </TestStoreContext.Provider>
  );
}

interface TestProps {
  title: string;
  code: string;
  func?: string;
}

function TestStatusIndicator({
  status,
  error,
}: {
  status: TestStatus;
  error?: string | null;
}) {
  const indicators = {
    [TestStatus.NotStarted]: {
      icon: Circle,
      variant: "secondary" as const,
      label: "Not Started",
    },
    [TestStatus.Running]: {
      icon: CircleDashed,
      variant: "info" as const,
      label: "Running",
    },
    [TestStatus.Passed]: {
      icon: CheckCircle2,
      variant: "success" as const,
      label: "Passed",
    },
    [TestStatus.Failed]: {
      icon: XCircle,
      variant: "destructive" as const,
      label: "Failed",
    },
    [TestStatus.Error]: {
      icon: AlertCircle,
      variant: "destructive" as const,
      label: "Error",
    },
  };

  const { icon: Icon, variant, label } = indicators[status];
  const badge = (
    <Badge variant={variant} className="flex items-center gap-1.5">
      <Icon className="w-3.5 h-3.5" />
      <span>{label}</span>
    </Badge>
  );

  if (status === TestStatus.Failed && error) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>{badge}</TooltipTrigger>
          <TooltipContent>
            <p>{error}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return badge;
}

export function Test({ title, code, func }: TestProps) {
  const id = useMemo(() => nanoid(), []);
  const { status, error, run } = useTest({ id, title, code, func });
  const store = useContext(TestStoreContext)!;
  const ws = useStore(store, (state) => state.ws);

  return (
    <div className="flex items-center justify-between p-2 rounded-lg border">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <FlaskConical className="w-4 h-4 text-muted-foreground" />
          <span className="font-medium">{title}</span>
        </div>
        <TestStatusIndicator status={status} error={error} />
      </div>
      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          size="sm"
          onClick={() => ws && run(ws)}
          disabled={status === TestStatus.Running}
          className="flex items-center gap-1.5"
        >
          {status === TestStatus.Running ? (
            <>
              <LoaderCircle className="w-3.5 h-3.5 animate-spin" />
              Running
            </>
          ) : (
            <>
              <PlayCircle className="w-3.5 h-3.5" />
              Run
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

function useTest(test: Test) {
  const store = useContext(TestStoreContext)!;

  const [status, setStatus] = useState<TestStatus>(TestStatus.NotStarted);
  const [error, setError] = useState<string | null>(null);

  function runTest(ws: WebSocket) {
    return new Promise<void>((resolve, reject) => {
      if (!ws) {
        setError("WebSocket not connected");
        reject(new Error("WebSocket not connected"));
        return;
      }

      setError(null);
      setStatus(TestStatus.Running);

      try {
        ws.send(JSON.stringify(test));

        const handleMessage = (event: MessageEvent) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === "test_result" && data.testId === test.id) {
              setStatus(data.status);
              if (data.status === TestStatus.Failed) {
                setError(data.error);
                reject(new Error(data.error));
              } else {
                resolve();
              }
              ws.removeEventListener("message", handleMessage);
            }
          } catch (err: unknown) {
            const error = `Failed to parse server response: ${err}`;
            setError(error);
            setStatus(TestStatus.Failed);
            reject(new Error(error));
            ws.removeEventListener("message", handleMessage);
          }
        };

        ws.addEventListener("message", handleMessage);
      } catch (err: unknown) {
        const error = `Failed to send test: ${err}`;
        setError(error);
        setStatus(TestStatus.Failed);
        reject(new Error(error));
      }
    });
  }

  useEffect(() => {
    store.setState((state) => ({
      tests: [...state.tests, { id: test.id, run: runTest }],
    }));

    return () => {
      store.setState((state) => ({
        tests: state.tests.filter((t) => t.id !== test.id),
      }));
    };
  }, [test.id, store]);

  return {
    status,
    error,
    run: runTest,
  };
}
