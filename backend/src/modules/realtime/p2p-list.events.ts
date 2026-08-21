export type P2pListEventType =
  | 'claimed'
  | 'released'
  | 'listed'
  | 'unlisted'
  | 'updated';

export interface P2pListEvent {
  type: P2pListEventType;
  withdrawalId?: string;
  claimedBy?: string;
  at: number;
  instanceId: string;
}
