import { RoomCanvas } from "@/components/RoomCanvas";
import { ErrorBoundary } from "@/components/ErrorBoundary";

export default async function CanvasPage({
  params,
}: {
  params: Promise<{ roomId: string }>;
}) {
  const { roomId } = await params;
  return (
    <ErrorBoundary>
      <RoomCanvas roomId={roomId} />
    </ErrorBoundary>
  );
}
