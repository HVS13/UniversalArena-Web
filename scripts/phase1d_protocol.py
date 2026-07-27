from phase1d_patch_lib import replace_once, root

path = root / "apps/client/src/relay-protocol.ts"
text = path.read_text(encoding="utf-8")
text = replace_once(
    text,
    'import { engineVersion, hashMatchState, type MatchState } from "@ua/core";',
    '''import {
  createPlayerStateView,
  engineVersion,
  hashMatchState,
  type MatchState,
} from "@ua/core";''',
    "relay protocol imports",
)
text = replace_once(
    text,
    '''  dataContentHash: string;
};''',
    '''  dataContentHash: string;
  guestState?: MatchState;
  guestStateHash?: string;
};''',
    "relay payload guest fields",
)
text = replace_once(text, 'export const clientVersion = "0.2.0-friend-alpha";', 'export const clientVersion = "0.2.1-friend-alpha";', "client version")
text = replace_once(text, 'export const relayVersion = "0.2.0-friend-alpha";', 'export const relayVersion = "0.2.1-friend-alpha";', "relay version")
text = replace_once(text, "export const relayProtocolVersion = 1;", "export const relayProtocolVersion = 2;", "relay protocol version")
anchor = '''export const createStateSyncPayload = (
  state: MatchState,
  setup?: Partial<SetupSyncPayload>
) => ({
  protocolVersion: relayProtocolVersion,
  state,
  actionId: state.actionId,
  stateHash: hashMatchState(state),
  engineVersion,
  dataSchemaVersion: dataManifest.schemaVersion,
  dataContentHash: dataManifest.contentHash,
  ...setup,
});'''
replacement = '''export const createStateSyncPayload = (
  state: MatchState,
  setup?: Partial<SetupSyncPayload>
) => {
  const guestState = createPlayerStateView(state, "p2");
  return {
    protocolVersion: relayProtocolVersion,
    state,
    actionId: state.actionId,
    stateHash: hashMatchState(state),
    guestState,
    guestStateHash: hashMatchState(guestState),
    engineVersion,
    dataSchemaVersion: dataManifest.schemaVersion,
    dataContentHash: dataManifest.contentHash,
    ...setup,
  };
};'''
text = replace_once(text, anchor, replacement, "create state payload")
path.write_text(text, encoding="utf-8")
