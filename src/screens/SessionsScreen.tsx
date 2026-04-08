import React, { useEffect, useState } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  Modal,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
} from 'react-native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import {
  CustomButton,
  CustomHeader,
  CustomInput,
  CustomText,
} from '@components';
import { colorScheme } from '../constants/colorScheme';
import {
  createSession,
  deleteSession,
  getSession,
  loadSessions,
  updateSession,
} from '../utils/sessionStorage';
import { MOCK_SESSIONS, USE_MOCK_SESSIONS } from '../config/mockSessions';
import type { Session } from '../types';
import SessionPage from '../pages/SessionPage';

type SessionsScreenProps = {
  onDetailOpen?: () => void;
  onDetailClose?: () => void;
  onChildHorizontalScrollStart?: () => void;
  onChildHorizontalScrollEnd?: () => void;
  onOpenSettingsFromSession?: () => void;
  sessionPageHideBottomPadding?: boolean;
  showHeader?: boolean;
  externalSessionExitTrigger?: number;
};

export default function SessionsScreen({
  onDetailOpen,
  onDetailClose,
  onChildHorizontalScrollStart,
  onChildHorizontalScrollEnd,
  onOpenSettingsFromSession,
  sessionPageHideBottomPadding,
  showHeader,
  externalSessionExitTrigger,
}: SessionsScreenProps) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [newName, setNewName] = useState('');
  const [activeSession, setActiveSession] = useState<Session | null>(null);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const refresh = async () => {
    try {
      const list = await loadSessions();
      setSessions(list);
      setStorageError(null);
    } catch (err: any) {
      console.warn('[SessionsScreen] loadSessions error', err);
      setStorageError('Storage unavailable (AsyncStorage not linked)');
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  useEffect(() => {
    if (externalSessionExitTrigger && activeSession) {
      setActiveSession(null);
      refresh();
      onDetailClose?.();
    }
  }, [externalSessionExitTrigger, activeSession, onDetailClose]);

  const handleCreate = async () => {
    if (storageError) return;
    if (!newName.trim()) return;
    try {
      const sess = await createSession(newName.trim());
      setNewName('');
      setActiveSession(sess);
      onDetailOpen?.();
      await refresh();
    } catch (err: any) {
      console.warn('[SessionsScreen] createSession error', err);
      setStorageError('Unable to save session (AsyncStorage error)');
    }
  };

  const handleDelete = async (id: string) => {
    await deleteSession(id);
    await refresh();
  };

  const handleLoad = async (id: string) => {
    const sess = await getSession(id);
    if (sess) {
      setActiveSession(sess);
      onDetailOpen?.();
    }
  };

  const handleLoadMock = (mock: Session) => {
    setActiveSession(mock);
    onDetailOpen?.();
  };

  if (activeSession) {
    return (
      <View style={styles.container}>
        <SessionPage
          session={activeSession}
          onExit={() => {
            setActiveSession(null);
            refresh();
            onDetailClose?.();
          }}
          onUpdate={async updated => {
            await updateSession(updated);
            setActiveSession(prev =>
              prev?.id === updated.id ? updated : prev,
            );
          }}
          onChildHorizontalScrollStart={onChildHorizontalScrollStart}
          onChildHorizontalScrollEnd={onChildHorizontalScrollEnd}
          onOpenSettings={() => {
            onOpenSettingsFromSession?.();
          }}
          hideBottomPadding={Boolean(sessionPageHideBottomPadding)}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {showHeader !== false ? (
        <CustomHeader
          title="Sessions"
          rightIcon="plus"
          onRightPress={() => setShowCreateModal(true)}
        />
      ) : null}
      <View style={styles.content}>
        {storageError ? (
          <CustomText style={styles.error}>{storageError}</CustomText>
        ) : null}

        <FlatList
          data={
            USE_MOCK_SESSIONS
              ? [
                  ...MOCK_SESSIONS,
                  ...sessions.filter(s => !s.id.startsWith('mock-')),
                ]
              : sessions
          }
          keyExtractor={item => item.id}
          renderItem={({ item }) => {
            const isMock = item.id.startsWith('mock-');
            return (
              <TouchableOpacity
                style={styles.sessionCard}
                activeOpacity={0.85}
                onPress={() =>
                  isMock ? handleLoadMock(item) : handleLoad(item.id)
                }
              >
                <View style={styles.sessionMetaContainer}>
                  <CustomText style={styles.sessionName}>
                    {item.name}
                  </CustomText>
                  <CustomText style={styles.sessionMeta}>
                    created {new Date(item.createdAt).toLocaleString()}
                    {isMock ? ' (demo)' : ''}
                  </CustomText>
                </View>

                {!isMock ? (
                  <TouchableOpacity
                    style={styles.deleteIcon}
                    activeOpacity={0.7}
                    onPress={e => {
                      e.stopPropagation();
                      handleDelete(item.id);
                    }}
                  >
                    <MaterialCommunityIcons
                      name="delete-outline"
                      size={22}
                      color={colorScheme.accent}
                    />
                  </TouchableOpacity>
                ) : null}
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <CustomText style={styles.empty}>No sessions yet</CustomText>
          }
          ListFooterComponent={<View style={styles.listFooter} />}
          contentContainerStyle={styles.listContent}
        />
      </View>

      <Modal
        visible={showCreateModal}
        animationType="fade"
        transparent
        onRequestClose={() => setShowCreateModal(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.modalContent}>
            <CustomText style={styles.modalTitle}>New session</CustomText>
            <CustomInput
              placeholder="Session name"
              value={newName}
              onChangeText={setNewName}
            />
            <View style={styles.modalButtons}>
              <CustomButton
                title="Cancel"
                variant="secondary"
                onPress={() => {
                  setShowCreateModal(false);
                  setNewName('');
                }}
              />
              <CustomButton
                title="Create"
                onPress={() => {
                  handleCreate();
                  setShowCreateModal(false);
                }}
                disabled={!newName.trim() || Boolean(storageError)}
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 0,
    backgroundColor: colorScheme.background,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  error: {
    textAlign: 'center',
    color: colorScheme.error,
    marginBottom: 12,
  },
  sessionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    marginVertical: 10,
    borderWidth: 1,
    borderColor: colorScheme.border,
    borderRadius: 12,
    backgroundColor: colorScheme.surface,
  },
  sessionMetaContainer: {
    flex: 1,
    paddingRight: 12,
  },
  sessionName: {
    fontSize: 18,
    fontWeight: '600',
    color: colorScheme.primaryText,
    marginBottom: 4,
  },
  sessionMeta: {
    fontSize: 12,
    color: colorScheme.subText,
  },
  deleteIcon: {
    padding: 8,
    borderRadius: 12,
  },
  empty: {
    textAlign: 'center',
    color: colorScheme.subText,
    marginTop: 24,
  },
  listContent: {
    paddingBottom: 140,
  },
  listFooter: {
    height: 140,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
    padding: 16,
  },
  modalContent: {
    backgroundColor: colorScheme.background,
    padding: 16,
    borderRadius: 12,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
    color: colorScheme.primaryText,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 12,
    gap: 8,
  },
});
