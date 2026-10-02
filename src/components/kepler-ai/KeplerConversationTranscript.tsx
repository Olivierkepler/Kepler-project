import React, { useEffect, useRef } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, typography } from "../../theme/colors";
import type { KeplerReference, KeplerSuggestedAction } from "../../services/api/keplerAssistant";
import type { KeplerConversationStatus, KeplerTranscriptMessage } from "../../utils/domain/keplerConversationState";

type Props = {
  messages: KeplerTranscriptMessage[];
  status: KeplerConversationStatus;
  errorMessage: string | null;
  onRetry: () => void;
  onOpenReference: (reference: KeplerReference) => void;
  canOpenReference: (reference: KeplerReference) => boolean;
  onOpenAction: (action: KeplerSuggestedAction) => void;
  canOpenAction: (action: KeplerSuggestedAction) => boolean;
};

function MessageBubble({
  message,
  onOpenReference,
  canOpenReference,
  onOpenAction,
  canOpenAction,
}: Pick<Props, "onOpenReference" | "canOpenReference" | "onOpenAction" | "canOpenAction"> & { message: KeplerTranscriptMessage }) {
  const isUser = message.role === "user";
  return (
    <View style={[styles.messageRow, isUser && styles.userMessageRow]}>
      {!isUser ? (
        <View style={styles.keplerMark} accessibilityElementsHidden>
          <Ionicons name="sparkles" size={12} color="#FFFFFF" />
        </View>
      ) : null}
      <View style={[styles.messageColumn, isUser && styles.userMessageColumn]}>
        {!isUser ? <Text style={styles.identity}>KEPLER AI</Text> : null}
        <View style={[styles.bubble, isUser ? styles.userBubble : styles.assistantBubble, message.deliveryState === "failed" && styles.failedBubble]}>
          <Text style={[styles.messageText, isUser && styles.userMessageText]}>{message.content}</Text>
        </View>
        {isUser && message.deliveryState !== "confirmed" ? (
          <Text style={styles.deliveryLabel}>{message.deliveryState === "sending" ? "Sending…" : "Not sent"}</Text>
        ) : null}
        {!isUser && message.references?.length ? (
          <View style={styles.referenceList}>
            {message.references.map((reference, index) => (
              canOpenReference(reference) ? (
                <Pressable
                  key={`${reference.kind}:${reference.canonicalId}:${index}`}
                  style={styles.referenceChip}
                  onPress={() => onOpenReference(reference)}
                  accessibilityRole="button"
                  accessibilityLabel={`Open reference ${reference.label}`}
                >
                  <Ionicons name="link-outline" size={13} color="#425466" />
                  <Text style={styles.referenceText} numberOfLines={1}>{reference.label}</Text>
                </Pressable>
              ) : (
                <View key={`${reference.kind}:${reference.canonicalId}:${index}`} style={styles.referenceChip}>
                  <Ionicons name="link-outline" size={13} color="#667085" />
                  <Text style={styles.referenceText} numberOfLines={1}>{reference.label}</Text>
                </View>
              )
            ))}
          </View>
        ) : null}
        {!isUser && message.suggestedActions?.length ? (
          <View style={styles.actionList}>
            {message.suggestedActions.filter(canOpenAction).map((action, index) => (
              <Pressable
                key={`${action.reference.kind}:${action.reference.canonicalId}:${index}`}
                style={styles.suggestedAction}
                onPress={() => onOpenAction(action)}
                accessibilityRole="button"
                accessibilityLabel={action.label}
              >
                <Text style={styles.suggestedActionText}>{action.label}</Text>
                <Ionicons name="arrow-forward" size={14} color="#012169" />
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}

export default function KeplerConversationTranscript(props: Props) {
  const listRef = useRef<FlatList<KeplerTranscriptMessage>>(null);
  useEffect(() => {
    if (props.messages.length) listRef.current?.scrollToEnd({ animated: true });
  }, [props.messages.length, props.status]);

  const showProcessing = props.status === "processing" || props.status === "creating" || props.status === "sending";
  return (
    <FlatList
      ref={listRef}
      style={styles.list}
      contentContainerStyle={styles.listContent}
      data={props.messages}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => <MessageBubble message={item} onOpenReference={props.onOpenReference} canOpenReference={props.canOpenReference} onOpenAction={props.onOpenAction} canOpenAction={props.canOpenAction} />}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
      showsVerticalScrollIndicator={false}
      ListFooterComponent={(
        <View style={styles.statusArea} accessibilityLiveRegion="polite">
          {showProcessing ? (
            <View style={styles.statusRow}>
              <ActivityIndicator size="small" color="#012169" />
              <Text style={styles.statusText}>{props.status === "creating" ? "Starting a private conversation…" : props.status === "processing" ? "Kepler is thinking…" : "Kepler is responding…"}</Text>
              {props.status === "processing" ? (
                <Pressable onPress={props.onRetry} style={styles.checkButton} accessibilityRole="button" accessibilityLabel="Check for Kepler response">
                  <Text style={styles.retryText}>Check response</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
          {props.status === "failed" && props.errorMessage ? (
            <View style={styles.errorCard}>
              <Text style={styles.errorText}>{props.errorMessage}</Text>
              <Pressable onPress={props.onRetry} style={styles.retryButton} accessibilityRole="button" accessibilityLabel={props.errorMessage.includes("respond") ? "Retry Kepler response" : "Retry sending message"}>
                <Ionicons name="refresh" size={15} color="#012169" />
                <Text style={styles.retryText}>Retry</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: { flex: 1 },
  listContent: { flexGrow: 1, paddingHorizontal: 17, paddingTop: 18, paddingBottom: 14, justifyContent: "flex-end" },
  messageRow: { width: "100%", flexDirection: "row", alignItems: "flex-start", gap: 8, marginBottom: 17 },
  userMessageRow: { justifyContent: "flex-end" },
  keplerMark: { width: 23, height: 23, borderRadius: 12, marginTop: 18, alignItems: "center", justifyContent: "center", backgroundColor: "#012169" },
  messageColumn: { maxWidth: "86%", alignItems: "flex-start" },
  userMessageColumn: { alignItems: "flex-end" },
  identity: { ...typography.metadata, color: "#012169", letterSpacing: 0.55, marginBottom: 5 },
  bubble: { paddingHorizontal: 14, paddingVertical: 11, borderRadius: 17, maxWidth: "100%" },
  userBubble: { backgroundColor: "#EAF0F8", borderTopRightRadius: 5 },
  assistantBubble: { backgroundColor: "#FFFFFF", borderWidth: StyleSheet.hairlineWidth, borderColor: "#E2E7EF", borderTopLeftRadius: 5 },
  failedBubble: { borderColor: "#D98B8B", opacity: 0.82 },
  messageText: { ...typography.body, color: colors.text.primary, lineHeight: 22 },
  userMessageText: { color: "#0B1550" },
  deliveryLabel: { ...typography.metadata, color: colors.text.muted, marginTop: 4, marginHorizontal: 3 },
  referenceList: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 },
  referenceChip: { maxWidth: 220, minHeight: 29, paddingHorizontal: 9, flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 10, backgroundColor: "#F1F4F8" },
  referenceText: { ...typography.metadata, color: "#344054", flexShrink: 1 },
  actionList: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 9 },
  suggestedAction: { minHeight: 34, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", gap: 7, borderRadius: 10, backgroundColor: "#F0F4FA" },
  suggestedActionText: { ...typography.metadata, color: "#012169" },
  statusArea: { minHeight: 1, paddingTop: 3 },
  statusRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8, paddingHorizontal: 33, paddingVertical: 7 },
  checkButton: { minHeight: 36, justifyContent: "center", paddingHorizontal: 7 },
  statusText: { ...typography.caption, color: colors.text.secondary },
  errorCard: { alignSelf: "flex-start", marginLeft: 31, marginTop: 4, marginBottom: 6, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, backgroundColor: "#FFF7F5", borderWidth: StyleSheet.hairlineWidth, borderColor: "#F0D7D2" },
  errorText: { ...typography.caption, color: "#5D3A37" },
  retryButton: { alignSelf: "flex-start", minHeight: 35, flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  retryText: { ...typography.bodyMedium, color: "#012169" },
});
