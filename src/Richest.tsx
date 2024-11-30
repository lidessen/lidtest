import {
  PropsWithChildren,
  createContext,
  useContext,
  useMemo,
  useRef,
  useState,
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
}

const createTestStore = () =>
  createStore<TestState>(() => ({
    ws: null,
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

  const connectionStatus: ConnectionStatus = error
    ? "error"
    : connected
    ? "connected"
    : "disconnected";

  const disconnect = useRef<() => void>(() => {});

  const connect = () => {
    setError(null);
    disconnect.current();

    if (!server) {
      store.setState({ ws: null });
      setConnected(false);
      return;
    }

    try {
      const ws = new WebSocket(server);
      const onOpen = () => {
        store.setState({ ws });
        setConnected(true);
        setError(null);
      };
      ws.addEventListener("open", onOpen);

      const onError = () => {
        setError("Failed to connect to server");
        setConnected(false);
        store.setState({ ws: null });
      };
      ws.addEventListener("error", onError);

      const onClose = () => {
        setConnected(false);
        store.setState({ ws: null });
      };
      ws.addEventListener("close", onClose);

      disconnect.current = () => {
        ws.removeEventListener("open", onOpen);
        ws.removeEventListener("error", onError);
        ws.removeEventListener("close", onClose);
        ws.close();
        store.setState({ ws: null });
        setConnected(false);
        setError(null);
      };
    } catch (err: unknown) {
      setError(`Failed to create WebSocket connection: ${err}`);
      setConnected(false);
      store.setState({ ws: null });
    }
  };

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
              {connected ? (
                <Button
                  variant="secondary"
                  onClick={() => disconnect.current()}
                >
                  Disconnect
                </Button>
              ) : (
                <Button variant="default" onClick={connect}>
                  Connect
                </Button>
              )}
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
          onClick={run}
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
  const ws = useStore(store, (state) => state.ws);
  const [status, setStatus] = useState<TestStatus>(TestStatus.NotStarted);
  const [error, setError] = useState<string | null>(null);

  function run() {
    if (!ws) {
      setError("WebSocket not connected");
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
            }
            ws.removeEventListener("message", handleMessage);
          }
        } catch (err: unknown) {
          setError(`Failed to parse server response: ${err}`);
          setStatus(TestStatus.Failed);
          ws.removeEventListener("message", handleMessage);
        }
      };

      ws.addEventListener("message", handleMessage);

      return () => {
        ws.removeEventListener("message", handleMessage);
      };
    } catch (err: unknown) {
      setError(`Failed to send test: ${err}`);
      setStatus(TestStatus.Failed);
    }
  }

  return {
    status,
    error,
    run,
  };
}
