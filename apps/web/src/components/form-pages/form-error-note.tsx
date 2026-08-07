export function FormErrorNote({ message }: { message: string }): React.ReactElement {
  return (
    <div role="alert" className="rounded-lg border border-ember/30 bg-mineral p-3 text-sm text-ember">
      {message}
    </div>
  );
}
