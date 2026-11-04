// Provider acceptance is required before recording a message as sent.
// Acceptance is not proof of delivery to the recipient's inbox.
export function requireEmailAccepted(result:{data?:{id:string}|null;error?:unknown}) {
  if(result.error || !result.data?.id) throw new Error("Email provider did not accept the message");
  return result.data.id;
}
