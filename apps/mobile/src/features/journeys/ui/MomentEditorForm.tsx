import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  createEntryId,
  createStopId,
  deleteJourneyMoment,
} from '@/features/entries/api/entries.repository'
import { saveJourneyMomentLocally } from '@/features/entries/api/save-journey-moment-local'
import {
  deleteEntryPhoto,
  EntryPhotoError,
  listEntryPhotos,
  setEntryCoverPhoto,
  updateEntryPhotoCaption,
  uploadEntryPhotos,
  type EntryPhotoSummary,
} from '@/features/entries/api/entry-photos.repository'
import {
  selectCoverPhotoGps,
  selectFirstPhotoGps,
} from '@/features/journeys/lib/photo-gps'
import type {
  JourneyEntry,
  JourneyStage,
} from '@/features/journeys/model/journey-detail'
import { LocationPickerMap } from '@/features/journeys/ui/LocationPickerMap'
import {
  pickPhotos,
  getCurrentLocation,
  type PickedPhoto,
} from '@/platform/media/photo'
import {
  buildMomentDraftKey,
  draftPhotoToPickedPhoto,
  listActiveMomentDraftPhotos,
  removeMomentDraftPhoto,
  setMomentDraftCoverPhoto,
  upsertMomentDraftPhoto,
} from '@/platform/media/draft-photos'
import { colors, spacing } from '@/foundation/theme'
import type { JourneyStop } from '@trip-diary/core/journey'

interface MomentEditorFormProps {
  creatorId: string
  entry?: JourneyEntry | null
  initialStageId?: string | null
  journeyId: string
  mode: 'create' | 'edit'
  onCancel: () => void
  onSaved: () => void
  spaceId: string
  stages?: JourneyStage[]
  stops?: JourneyStop[]
  userId: string
}

function readStopPoint(
  stops: JourneyStop[],
  stopId: string | null | undefined,
): { latitude: number; longitude: number } | null {
  if (stopId === null || stopId === undefined) {
    return null
  }

  const stop = stops.find((candidate) => candidate.id === stopId)
  if (
    stop === undefined ||
    stop.mapLatitude === null ||
    stop.mapLongitude === null ||
    !Number.isFinite(stop.mapLatitude) ||
    !Number.isFinite(stop.mapLongitude)
  ) {
    return null
  }

  return {
    latitude: stop.mapLatitude,
    longitude: stop.mapLongitude,
  }
}

export function MomentEditorForm({
  creatorId,
  entry,
  initialStageId = null,
  journeyId,
  mode,
  onCancel,
  onSaved,
  spaceId,
  stages = [],
  stops = [],
  userId,
}: MomentEditorFormProps) {
  const { i18n, t } = useTranslation()
  const insets = useSafeAreaInsets()
  const [title, setTitle] = useState(entry?.title ?? '')
  const [body, setBody] = useState(entry?.body ?? '')
  const [stageId, setStageId] = useState<string | null>(
    entry?.stageId ?? initialStageId,
  )
  const [selectedPoint, setSelectedPoint] = useState<{
    latitude: number
    longitude: number
  } | null>(() => readStopPoint(stops, entry?.stopId))
  const [pickedPhotos, setPickedPhotos] = useState<PickedPhoto[]>([])
  const [coverLocalId, setCoverLocalId] = useState<string | null>(null)
  const [existingPhotos, setExistingPhotos] = useState<EntryPhotoSummary[]>([])
  const [captionPhotoId, setCaptionPhotoId] = useState<string | null>(null)
  const [captionDraft, setCaptionDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [pickingPhotos, setPickingPhotos] = useState(false)
  const [locatingUser, setLocatingUser] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [gpsNotice, setGpsNotice] = useState<string | null>(null)
  const [photoNotice, setPhotoNotice] = useState<string | null>(null)
  const [locationSource, setLocationSource] = useState<
    'current' | 'map' | 'photo' | null
  >(selectedPoint !== null ? 'map' : null)

  // Stable local identity for create — allocated before remote insert so photos
  // and Moment content can be saved offline against the same UUID.
  const [localEntryId] = useState(
    () => entry?.id ?? createEntryId(),
  )

  const draftKey = useMemo(
    () =>
      buildMomentDraftKey({
        entryId: localEntryId,
        journeyId,
        mode,
      }),
    [journeyId, localEntryId, mode],
  )

  useEffect(() => {
    let cancelled = false
    void listActiveMomentDraftPhotos(draftKey)
      .then((rows) => {
        if (cancelled) {
          return
        }
        const restored = rows.map(draftPhotoToPickedPhoto)
        if (restored.length === 0) {
          return
        }
        setPickedPhotos(restored)
        const cover = rows.find((row) => row.isCover)
        setCoverLocalId(
          cover?.id ??
            restored.find((photo) => photo.status === 'ready')?.localId ??
            null,
        )
        setPhotoNotice(
          t('entry.photosDraftRestored', { count: restored.length }),
        )
      })
      .catch(() => {
        // Keep empty picks if draft restore fails.
      })

    return () => {
      cancelled = true
    }
  }, [draftKey, t])

  useEffect(() => {
    if (mode !== 'edit' || entry === undefined || entry === null) {
      return
    }

    void listEntryPhotos(entry.id)
      .then((photos) => {
        setExistingPhotos(photos)
        const cover = photos.find((photo) => photo.isCover)
        if (cover !== undefined) {
          setCoverLocalId(cover.id)
        }
        if (photos.length === 0) {
          setPhotoNotice(null)
        }
      })
      .catch((loadError: unknown) => {
        setExistingPhotos([])
        const message =
          loadError instanceof Error
            ? loadError.message
            : t('entry.photoPickerError')
        setPhotoNotice(message)
      })
  }, [entry, mode, t])

  const photoGps = useMemo(
    () =>
      selectCoverPhotoGps([
        ...pickedPhotos.map((photo) => ({
          isCover: photo.localId === coverLocalId,
          latitude: photo.metadata.latitude,
          longitude: photo.metadata.longitude,
        })),
        ...existingPhotos.map((photo) => ({
          isCover: photo.id === coverLocalId,
          latitude: photo.latitude,
          longitude: photo.longitude,
        })),
      ]),
    [coverLocalId, existingPhotos, pickedPhotos],
  )

  const resolvedLocation = selectedPoint ?? photoGps ?? null

  const photoMapMarkers = useMemo(() => {
    const markers: Array<{
      id: string
      latitude: number
      longitude: number
      title: string
    }> = []

    for (const photo of pickedPhotos) {
      if (photo.status !== 'ready') {
        continue
      }
      const latitude = photo.metadata.latitude
      const longitude = photo.metadata.longitude
      if (
        latitude === null ||
        longitude === null ||
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude)
      ) {
        continue
      }
      markers.push({
        id: photo.localId,
        latitude,
        longitude,
        title:
          photo.localId === coverLocalId
            ? t('entry.coverPhoto')
            : t('entry.photoHasGps'),
      })
    }

    for (const photo of existingPhotos) {
      if (
        photo.latitude === null ||
        photo.longitude === null ||
        !Number.isFinite(photo.latitude) ||
        !Number.isFinite(photo.longitude)
      ) {
        continue
      }
      markers.push({
        id: photo.id,
        latitude: photo.latitude,
        longitude: photo.longitude,
        title:
          photo.id === coverLocalId
            ? t('entry.coverPhoto')
            : t('entry.photoHasGps'),
      })
    }

    return markers
  }, [coverLocalId, existingPhotos, pickedPhotos, t])

  async function handlePickPhotos(): Promise<void> {
    setError(null)
    setPhotoNotice(null)
    setPickingPhotos(true)

    try {
      const startingPosition = pickedPhotos.length
      let preparedCount = 0
      const result = await pickPhotos({
        onItemPrepared: async (photo) => {
          await upsertMomentDraftPhoto({
            draftKey,
            entryId: entry?.id ?? null,
            journeyId,
            photo,
            position: startingPosition + preparedCount,
          })
          preparedCount += 1
          setPickedPhotos((current) => {
            if (current.some((item) => item.localId === photo.localId)) {
              return current.map((item) =>
                item.localId === photo.localId ? photo : item,
              )
            }
            return [...current, photo]
          })
          if (photo.status === 'ready') {
            setCoverLocalId((currentCover) => {
              if (currentCover !== null) {
                return currentCover
              }
              void setMomentDraftCoverPhoto(draftKey, photo.localId)
              return photo.localId
            })
          }
        },
      })
      if (result.status === 'canceled') {
        setPhotoNotice(t('entry.photoPickerCanceled'))
        return
      }

      if (result.status === 'empty' || result.photos.length === 0) {
        setPhotoNotice(t('entry.photoPickerEmptyLibrary'))
        return
      }

      const photos = result.photos
      const failedCount = photos.filter((photo) => photo.status === 'failed')
        .length
      if (failedCount > 0) {
        setPhotoNotice(
          t('entry.photosPreparePartial', {
            failed: failedCount,
            total: photos.length,
          }),
        )
      }
      const gps = selectFirstPhotoGps(
        photos
          .filter((photo) => photo.status === 'ready')
          .map((photo) => ({
            latitude: photo.metadata.latitude,
            longitude: photo.metadata.longitude,
          })),
      )

      if (gps === null) {
        setGpsNotice(t('journey.photoGpsMissing'))
      } else if (locationSource === null || locationSource === 'photo') {
        setSelectedPoint(gps)
        setLocationSource('photo')
        setGpsNotice(t('journey.photoGpsDetected'))
      } else {
        setGpsNotice(t('journey.photoGpsDetected'))
      }
    } catch (pickError) {
      const message =
        pickError instanceof Error
          ? pickError.message
          : t('entry.photoPickerError')

      if (message.toLowerCase().includes('permission')) {
        setPhotoNotice(t('entry.photoPickerLimitedAccess'))
      } else {
        setError(message)
      }
    } finally {
      setPickingPhotos(false)
    }
  }

  async function handleUseCurrentLocation(): Promise<void> {
    setError(null)
    setLocatingUser(true)

    try {
      const location = await getCurrentLocation()
      if (location === null) {
        setError(t('journey.currentLocationFailed'))
        return
      }

      setSelectedPoint(location)
      setLocationSource('current')
    } catch {
      setError(t('journey.currentLocationFailed'))
    } finally {
      setLocatingUser(false)
    }
  }

  async function handleSave(): Promise<void> {
    const trimmedTitle = title.trim()
    if (trimmedTitle.length === 0) {
      setError(t('journey.addError'))
      return
    }

    setBusy(true)
    setError(null)

    try {
      const language = i18n.language === 'en' ? 'en' : 'cs'
      const eventAt =
        mode === 'edit' && entry?.eventAt !== null && entry?.eventAt !== undefined
          ? entry.eventAt
          : new Date().toISOString()
      let photoUploadError: string | null = null

      const { entryId } = await saveJourneyMomentLocally({
        body: body.trim(),
        creatorId,
        entryId: localEntryId,
        eventAt,
        journeyId,
        language,
        latitude: resolvedLocation?.latitude ?? null,
        locationTitle: trimmedTitle,
        longitude: resolvedLocation?.longitude ?? null,
        mode,
        spaceId,
        stageId,
        stopId:
          resolvedLocation !== null
            ? (entry?.stopId ?? createStopId())
            : (entry?.stopId ?? null),
        title: trimmedTitle,
        type: entry?.type ?? 'story',
        userId,
        visibility: 'public',
      })

      if (pickedPhotos.length > 0) {
        try {
          const uploadResult = await uploadEntryPhotos({
            coverLocalId,
            draftKey: buildMomentDraftKey({
              entryId,
              journeyId,
              mode: 'edit',
            }),
            entryId,
            journeyId,
            photos: pickedPhotos,
            startingPosition: existingPhotos.length,
            userId,
          })
          if (uploadResult.failed.length > 0) {
            photoUploadError = t('entry.photosPartialUpload', {
              uploaded: uploadResult.queuedCount,
              total: pickedPhotos.length,
            })
          } else if (uploadResult.queuedCount > 0) {
            photoUploadError = t('entry.photosQueued', {
              count: uploadResult.queuedCount,
            })
          }
        } catch (uploadError) {
          photoUploadError = formatPhotoUploadError(uploadError, t)
          if (__DEV__) {
            console.log('[moment-photos] enqueue failed after local save', {
              code:
                uploadError instanceof EntryPhotoError
                  ? uploadError.code
                  : 'UNKNOWN',
              message: photoUploadError,
            })
          }
        }
      }

      // Persist cover even when new photos were also uploaded. Upload only
      // marks cover for newly picked IDs; an existing photo selection needs RPC.
      if (
        mode === 'edit' &&
        coverLocalId !== null &&
        existingPhotos.some((photo) => photo.id === coverLocalId) &&
        !existingPhotos.some(
          (photo) => photo.id === coverLocalId && photo.isCover,
        )
      ) {
        try {
          await setEntryCoverPhoto(entryId, coverLocalId)
        } catch {
          // Cover can sync later; Moment content is already durable locally.
        }
      }

      if (photoUploadError !== null) {
        Alert.alert(t('entry.photos'), photoUploadError, [
          { onPress: () => onSaved(), text: 'OK' },
        ])
        return
      }

      onSaved()
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : t('journey.addError'),
      )
    } finally {
      setBusy(false)
    }
  }

  function handleDeleteMoment(): void {
    if (entry === null || entry === undefined) {
      return
    }

    Alert.alert(t('entry.deleteAction'), t('entry.deleteConfirm'), [
      { style: 'cancel', text: t('common.cancel') },
      {
        style: 'destructive',
        text: t('entry.deleteAction'),
        onPress: () => {
          void (async () => {
            setBusy(true)
            try {
              await deleteJourneyMoment(entry.id)
              onSaved()
            } catch (deleteError) {
              setError(
                deleteError instanceof Error
                  ? deleteError.message
                  : t('journey.addError'),
              )
            } finally {
              setBusy(false)
            }
          })()
        },
      },
    ])
  }

  return (
    <ScrollView
      contentContainerStyle={[
        styles.container,
        { paddingBottom: insets.bottom + spacing.xl },
      ]}
      keyboardShouldPersistTaps="handled"
    >
      {error !== null ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}

      <Text style={styles.label}>{t('entry.title')}</Text>
      <TextInput
        accessibilityLabel={t('entry.title')}
        editable={!busy}
        onChangeText={setTitle}
        style={styles.input}
        testID="moment-title-input"
        value={title}
      />

      <Text style={styles.label}>{t('entry.body')}</Text>
      <TextInput
        accessibilityLabel={t('entry.body')}
        editable={!busy}
        multiline
        onChangeText={setBody}
        style={[styles.input, styles.textArea]}
        testID="moment-body-input"
        value={body}
      />

      {stages.length > 0 ? (
        <View style={styles.stagePicker}>
          <Text style={styles.label}>{t('journey.organizeMoment')}</Text>
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={() => {
              setStageId(null)
            }}
            style={[
              styles.stageChip,
              stageId === null ? styles.stageChipActive : null,
            ]}
          >
            <Text style={styles.stageChipText}>
              {t('journey.undatedMoments')}
            </Text>
          </Pressable>
          {stages.map((stage) => (
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              key={stage.id}
              onPress={() => {
                setStageId(stage.id)
              }}
              style={[
                styles.stageChip,
                stageId === stage.id ? styles.stageChipActive : null,
              ]}
            >
              <Text style={styles.stageChipText}>{stage.title}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      <Text style={styles.label}>{t('entry.photos')}</Text>
      <Text style={styles.helper}>{t('entry.photoPickerHint')}</Text>
      <Pressable
        accessibilityLabel={t('entry.photoPickerAction')}
        accessibilityRole="button"
        disabled={busy || pickingPhotos}
        onPress={() => {
          void handlePickPhotos()
        }}
        style={[
          styles.secondaryButton,
          busy || pickingPhotos ? styles.buttonDisabled : null,
        ]}
        testID="moment-pick-photos"
      >
        {pickingPhotos ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <Text style={styles.secondaryButtonText}>
            {t('entry.photoPickerAction')}
          </Text>
        )}
      </Pressable>

      {pickingPhotos ? (
        <Text style={styles.helper}>{t('entry.photoPickerLoading')}</Text>
      ) : null}

      {photoNotice !== null ? (
        <Text accessibilityRole="text" style={styles.notice}>
          {photoNotice}
        </Text>
      ) : null}

      {pickedPhotos.length > 0 ? (
        <View style={styles.previewGrid}>
          {pickedPhotos.map((photo) => {
            const isCover = photo.localId === coverLocalId
            const isFailed = photo.status === 'failed'
            return (
              <Pressable
                accessibilityLabel={
                  isFailed
                    ? t('entry.photoFailedRetry')
                    : isCover
                      ? t('entry.coverPhoto')
                      : t('entry.setCoverPhoto')
                }
                accessibilityRole="button"
                key={photo.localId}
                onLongPress={() => {
                  void removeMomentDraftPhoto(photo.localId)
                  setPickedPhotos((current) =>
                    current.filter((item) => item.localId !== photo.localId),
                  )
                  if (coverLocalId === photo.localId) {
                    const nextCover =
                      pickedPhotos.find(
                        (item) =>
                          item.localId !== photo.localId &&
                          item.status === 'ready',
                      )?.localId ?? null
                    setCoverLocalId(nextCover)
                    if (nextCover !== null) {
                      void setMomentDraftCoverPhoto(draftKey, nextCover)
                    }
                  }
                }}
                onPress={() => {
                  if (isFailed) {
                    setPhotoNotice(
                      photo.diagnostics.lastError ??
                        t('entry.photoPrepareFailed'),
                    )
                    return
                  }
                  setCoverLocalId(photo.localId)
                  void setMomentDraftCoverPhoto(draftKey, photo.localId)
                  const gps = selectFirstPhotoGps([
                    {
                      latitude: photo.metadata.latitude,
                      longitude: photo.metadata.longitude,
                    },
                  ])
                  if (
                    gps !== null &&
                    (locationSource === null || locationSource === 'photo')
                  ) {
                    setSelectedPoint(gps)
                    setLocationSource('photo')
                  }
                }}
                style={styles.previewItem}
                testID={`picked-photo-${photo.localId}`}
              >
                {isFailed || photo.uri.length === 0 ? (
                  <View
                    style={[
                      styles.previewImage,
                      styles.previewImageFailed,
                      isCover ? styles.previewImageCover : null,
                    ]}
                  >
                    <Text style={styles.previewFailedText}>
                      {t('entry.photoStatusFailed')}
                    </Text>
                  </View>
                ) : (
                  <Image
                    accessibilityIgnoresInvertColors
                    onError={() => {
                      setPickedPhotos((current) =>
                        current.map((item) =>
                          item.localId === photo.localId
                            ? {
                                ...item,
                                diagnostics: {
                                  ...item.diagnostics,
                                  failedStage: 'validate',
                                  lastError:
                                    item.diagnostics.lastError ??
                                    'Photo preview failed to render.',
                                },
                                status: 'failed',
                              }
                            : item,
                        ),
                      )
                    }}
                    source={{
                      uri:
                        photo.smallUri ??
                        photo.thumbUri ??
                        photo.uri,
                    }}
                    style={[
                      styles.previewImage,
                      isCover ? styles.previewImageCover : null,
                    ]}
                  />
                )}
                <Text style={styles.previewBadge}>
                  {isFailed
                    ? t('entry.photoStatusFailed')
                    : isCover
                      ? t('entry.coverPhoto')
                      : photo.metadata.latitude !== null
                        ? t('entry.photoHasGps')
                        : t('entry.photoNoGps')}
                </Text>
              </Pressable>
            )
          })}
        </View>
      ) : null}

      {pickedPhotos.length > 0 ? (
        <Text style={styles.helper}>
          {t('entry.photosSelected', { count: pickedPhotos.length })}
        </Text>
      ) : null}

      {gpsNotice !== null ? (
        <Text style={styles.helper}>{gpsNotice}</Text>
      ) : null}

      <Text style={styles.label}>{t('journey.mapPicker')}</Text>
      <Pressable
        accessibilityLabel={t('journey.useCurrentLocation')}
        accessibilityRole="button"
        disabled={busy || locatingUser}
        onPress={() => {
          void handleUseCurrentLocation()
        }}
        style={[
          styles.secondaryButton,
          busy || locatingUser ? styles.buttonDisabled : null,
        ]}
        testID="moment-use-current-location"
      >
        {locatingUser ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <Text style={styles.secondaryButtonText}>
            {t('journey.useCurrentLocation')}
          </Text>
        )}
      </Pressable>
      <LocationPickerMap
        onSelectPhotoMarker={(photoId) => {
          const pickedIndex = pickedPhotos.findIndex(
            (photo) => photo.localId === photoId,
          )
          if (pickedIndex >= 0) {
            setPhotoNotice(
              `${t('entry.photoHasGps')} · ${String(pickedIndex + 1)}/${String(pickedPhotos.length)}`,
            )
            return
          }

          const existingIndex = existingPhotos.findIndex(
            (photo) => photo.id === photoId,
          )
          if (existingIndex >= 0) {
            setPhotoNotice(
              `${t('entry.photoHasGps')} · ${String(existingIndex + 1)}/${String(existingPhotos.length)}`,
            )
          }
        }}
        onSelectPoint={(point) => {
          setSelectedPoint(point)
          setLocationSource('map')
        }}
        photoMarkers={photoMapMarkers}
        selectedPoint={resolvedLocation}
        stops={stops}
      />
      {locationSource !== null ? (
        <Text style={styles.helper}>
          {t(`journey.locationSource.${locationSource}`)}
        </Text>
      ) : null}
      {resolvedLocation === null ? (
        <Text style={styles.helper}>{t('journey.photoGpsMissing')}</Text>
      ) : (
        <Text style={styles.helper}>
          {t('journey.selectedPoint', {
            latitude: resolvedLocation.latitude.toFixed(4),
            longitude: resolvedLocation.longitude.toFixed(4),
          })}
        </Text>
      )}

      {existingPhotos.length > 0 ? (
        <View style={styles.previewGrid}>
          {existingPhotos.map((photo) => {
            const isCover =
              coverLocalId !== null ? photo.id === coverLocalId : photo.isCover
            return (
              <View key={photo.id} style={styles.previewItem}>
                <Pressable
                  accessibilityLabel={
                    isCover ? t('entry.coverPhoto') : t('entry.setCoverPhoto')
                  }
                  accessibilityRole="button"
                  onPress={() => {
                    setCoverLocalId(photo.id)
                  }}
                  testID={`existing-photo-${photo.id}`}
                >
                  {photo.previewUrl !== null ? (
                    <Image
                      accessibilityIgnoresInvertColors
                      source={{ uri: photo.previewUrl }}
                      style={[
                        styles.previewImage,
                        isCover ? styles.previewImageCover : null,
                      ]}
                    />
                  ) : (
                    <View
                      style={[
                        styles.previewImage,
                        styles.previewPlaceholder,
                        isCover ? styles.previewImageCover : null,
                      ]}
                    />
                  )}
                  <Text style={styles.previewBadge}>
                    {isCover
                      ? t('entry.coverPhoto')
                      : photo.hasGps
                        ? t('entry.photoHasGps')
                        : t('entry.photoNoGps')}
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityLabel={t('entry.editPhotoCaption')}
                  accessibilityRole="button"
                  disabled={busy}
                  onPress={() => {
                    setCaptionPhotoId(photo.id)
                    setCaptionDraft(photo.caption ?? '')
                  }}
                  style={styles.linkButton}
                >
                  <Text style={styles.linkText}>
                    {t('entry.editPhotoCaption')}
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  disabled={busy || entry === null || entry === undefined}
                  onPress={() => {
                    if (entry === null || entry === undefined) {
                      return
                    }

                    Alert.alert(
                      t('entry.deletePhoto'),
                      t('entry.deleteConfirm'),
                      [
                        { style: 'cancel', text: t('common.cancel') },
                        {
                          style: 'destructive',
                          text: t('entry.deleteAction'),
                          onPress: () => {
                            void (async () => {
                              setBusy(true)
                              try {
                                await deleteEntryPhoto(entry.id, photo.id)
                                setExistingPhotos((current) => {
                                  const next = current.filter(
                                    (item) => item.id !== photo.id,
                                  )
                                  if (coverLocalId === photo.id) {
                                    setCoverLocalId(next[0]?.id ?? null)
                                  }
                                  return next
                                })
                              } catch (deletePhotoError) {
                                setError(
                                  deletePhotoError instanceof Error
                                    ? deletePhotoError.message
                                    : t('journey.addError'),
                                )
                              } finally {
                                setBusy(false)
                              }
                            })()
                          },
                        },
                      ],
                    )
                  }}
                  style={styles.linkButton}
                >
                  <Text style={styles.linkText}>{t('entry.deletePhoto')}</Text>
                </Pressable>
              </View>
            )
          })}
        </View>
      ) : null}

      {captionPhotoId !== null ? (
        <View style={styles.captionEditor}>
          <Text style={styles.label}>{t('entry.photoCaption')}</Text>
          <TextInput
            multiline
            onChangeText={setCaptionDraft}
            placeholder={t('entry.photoCaptionPlaceholder')}
            style={[styles.input, styles.captionInput]}
            value={captionDraft}
          />
          <Pressable
            accessibilityRole="button"
            disabled={busy || entry === null || entry === undefined}
            onPress={() => {
              if (entry === null || entry === undefined) {
                return
              }
              void (async () => {
                setBusy(true)
                try {
                  await updateEntryPhotoCaption(
                    entry.id,
                    captionPhotoId,
                    captionDraft,
                  )
                  setExistingPhotos((current) =>
                    current.map((photo) =>
                      photo.id === captionPhotoId
                        ? {
                            ...photo,
                            caption:
                              captionDraft.trim().length > 0
                                ? captionDraft.trim()
                                : null,
                          }
                        : photo,
                    ),
                  )
                  setCaptionPhotoId(null)
                  setPhotoNotice(t('entry.photoCaptionSaved'))
                } catch {
                  setError(t('entry.photoCaptionSaveFailed'))
                } finally {
                  setBusy(false)
                }
              })()
            }}
            style={[
              styles.secondaryButton,
              busy ? styles.buttonDisabled : null,
            ]}
          >
            <Text style={styles.secondaryButtonText}>
              {t('entry.saveChanges')}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={() => {
              setCaptionPhotoId(null)
            }}
            style={styles.linkButton}
          >
            <Text style={styles.linkText}>{t('entry.cancelEdit')}</Text>
          </Pressable>
        </View>
      ) : null}

      <Pressable
        accessibilityLabel={
          mode === 'create' ? t('journey.addMoment') : t('entry.saveChanges')
        }
        accessibilityRole="button"
        disabled={busy}
        onPress={() => {
          void handleSave()
        }}
        style={[styles.primaryButton, busy ? styles.buttonDisabled : null]}
        testID="moment-save"
      >
        {busy ? (
          <ActivityIndicator color="#ffffff" />
        ) : (
          <Text style={styles.primaryButtonText}>
            {mode === 'create'
              ? t('journey.addMoment')
              : t('entry.saveChanges')}
          </Text>
        )}
      </Pressable>

      <Pressable
        accessibilityLabel={t('entry.cancelEdit')}
        accessibilityRole="button"
        disabled={busy}
        onPress={onCancel}
        style={styles.linkButton}
        testID="moment-cancel"
      >
        <Text style={styles.linkText}>{t('entry.cancelEdit')}</Text>
      </Pressable>

      {mode === 'edit' ? (
        <Pressable
          accessibilityLabel={t('entry.deleteAction')}
          accessibilityRole="button"
          disabled={busy}
          onPress={handleDeleteMoment}
          style={[styles.dangerButton, busy ? styles.buttonDisabled : null]}
          testID="moment-delete"
        >
          <Text style={styles.dangerButtonText}>{t('entry.deleteAction')}</Text>
        </Pressable>
      ) : null}
    </ScrollView>
  )
}

function formatPhotoUploadError(
  error: unknown,
  t: (key: string) => string,
): string {
  if (error instanceof EntryPhotoError) {
    switch (error.code) {
      case 'PERMISSION':
        return t('entry.photoPickerLimitedAccess')
      case 'NETWORK':
        return t('entry.photoUploadNetworkError')
      case 'ASSET_INVALID':
        return t('entry.photoPickerError')
      case 'DATABASE':
        return t('entry.photoUploadDatabaseError')
      case 'QUEUE':
        return t('entry.photoUploadQueueError')
      case 'STORAGE':
        return t('entry.photoUploadStorageError')
      case 'TIMEOUT':
        return t('entry.photoUploadTimeoutError')
      case 'UPLOAD':
        return t('entry.photoUploadFailed')
      case 'UNKNOWN':
        return error.message.length > 0
          ? error.message
          : t('entry.photoUploadFailed')
    }
  }

  return error instanceof Error ? error.message : t('entry.photoPickerError')
}

const styles = StyleSheet.create({
  buttonDisabled: {
    opacity: 0.6,
  },
  captionEditor: {
    marginBottom: spacing.md,
    marginTop: spacing.sm,
  },
  captionInput: {
    minHeight: 88,
    textAlignVertical: 'top',
  },
  container: {
    padding: spacing.lg,
  },
  dangerButton: {
    alignItems: 'center',
    marginTop: spacing.lg,
    minHeight: 44,
    paddingVertical: spacing.sm,
  },
  dangerButtonText: {
    color: colors.error,
    fontSize: 16,
    fontWeight: '600',
  },
  error: {
    color: colors.error,
    marginBottom: spacing.md,
  },
  helper: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: spacing.sm,
  },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 10,
    borderWidth: 1,
    color: colors.text,
    fontSize: 16,
    marginBottom: spacing.md,
    minHeight: 44,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  label: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  linkButton: {
    alignItems: 'center',
    minHeight: 44,
    paddingVertical: spacing.sm,
  },
  linkText: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: '600',
  },
  notice: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: spacing.sm,
  },
  photoId: {
    color: colors.textMuted,
    flex: 1,
    fontFamily: 'monospace',
    fontSize: 12,
  },
  photoList: {
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  photoRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  previewBadge: {
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 4,
    maxWidth: 88,
  },
  previewGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  previewImage: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    height: 72,
    width: 72,
  },
  previewImageFailed: {
    alignItems: 'center',
    justifyContent: 'center',
    borderColor: colors.error,
  },
  previewFailedText: {
    color: colors.error,
    fontSize: 10,
    fontWeight: '600',
    textAlign: 'center',
  },
  previewImageCover: {
    borderColor: colors.primary,
    borderWidth: 3,
  },
  previewItem: {
    marginBottom: spacing.xs,
    marginRight: spacing.xs,
    width: 88,
  },
  previewPlaceholder: {
    backgroundColor: '#d9d9d9',
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: 10,
    justifyContent: 'center',
    marginTop: spacing.sm,
    minHeight: 44,
    paddingVertical: spacing.sm,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: 'center',
    marginBottom: spacing.sm,
    minHeight: 44,
    paddingVertical: spacing.sm,
  },
  secondaryButtonText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  stageChip: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 999,
    borderWidth: 1,
    marginBottom: spacing.xs,
    marginRight: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  stageChipActive: {
    backgroundColor: '#e8f3ea',
    borderColor: colors.primary,
  },
  stageChipText: {
    color: colors.text,
    fontSize: 14,
  },
  stagePicker: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: spacing.md,
  },
  textArea: {
    minHeight: 120,
    textAlignVertical: 'top',
  },
})
