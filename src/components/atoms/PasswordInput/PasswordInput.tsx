import React, { useState, useRef, useImperativeHandle, forwardRef } from 'react'
import { StyleSheet, TextInput } from 'react-native'
import { XStack, useTheme, getTokenValue } from 'tamagui'
import { BaseTouchable } from '@ksairi-org/ui-touchables'
import { Feather } from '@expo/vector-icons'

type PasswordInputProps = {
  value: string
  onChangeText: (text: string) => void
  placeholder: string
  onBlur?: () => void
  onSubmitEditing?: () => void
  returnKeyType?: 'done' | 'next' | 'go'
  autoComplete?: 'current-password' | 'new-password'
  mb?: string | number
}

export type PasswordInputHandle = { focus: () => void }

export const PasswordInput = forwardRef<PasswordInputHandle, PasswordInputProps>(({
  value,
  onChangeText,
  placeholder,
  onBlur,
  onSubmitEditing,
  returnKeyType = 'done',
  autoComplete = 'current-password',
  mb = '$2',
}, ref) => {
  const [visible, setVisible] = useState(false)
  const [focused, setFocused] = useState(false)
  const inputRef = useRef<TextInput>(null)
  const theme = useTheme()

  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus(),
  }))

  const mbValue = typeof mb === 'string' && mb.startsWith('$')
    ? getTokenValue(mb as '$1' | '$2' | '$3' | '$4' | '$5' | '$6', 'space')
    : mb

  return (
    <XStack
      position="relative"
      alignSelf="stretch"
      mb={mbValue as number}
      borderRadius="$4"
      borderWidth={1}
      borderColor={focused ? '$accentBackground' : '$borderColor'}
      bg="$surface-card"
      overflow="hidden">
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={onChangeText}
        onFocus={() => setFocused(true)}
        onBlur={() => { setFocused(false); onBlur?.() }}
        onSubmitEditing={onSubmitEditing}
        returnKeyType={returnKeyType}
        placeholder={placeholder}
        placeholderTextColor={theme['text-placeholder'].val}
        secureTextEntry={!visible}
        autoComplete={autoComplete}
        autoCapitalize="none"
        style={[styles.input, { color: theme['text-emphasis'].val }]}
      />
      <BaseTouchable
        position="absolute"
        right="$3"
        top={0}
        bottom={0}
        justify="center"
        onPress={() => setVisible(v => !v)}>
        <Feather
          name={visible ? 'eye-off' : 'eye'}
          size={18}
          color={theme['text-placeholder'].val}
        />
      </BaseTouchable>
    </XStack>
  )
})

PasswordInput.displayName = 'PasswordInput'

const styles = StyleSheet.create({
  input: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 12,
    paddingHorizontal: 12,
    paddingRight: 44,
  },
})
