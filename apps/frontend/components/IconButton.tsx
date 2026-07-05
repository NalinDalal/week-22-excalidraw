export function IconButton({
  icon,
  onClick,
  activated,
}: {
  icon: React.ReactNode;
  onClick: () => void;
  activated: boolean;
}) {
  return (
    <div
      className={`m-1 cursor-pointer rounded-full border p-2 bg-black hover:bg-gray-600 ${activated ? "text-red-400" : "text-white"}`}
      onClick={onClick}
    >
      {icon}
    </div>
  );
}
