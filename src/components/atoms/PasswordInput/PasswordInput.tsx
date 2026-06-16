import { useState, useRef, useImperativeHandle, type ComponentRef, type Ref } from 'react'
import { Input, XStack, useTheme, styled } from 'tamagui'
import { BaseTouchable } from '@ksairi-org/ui-touchables'
import { Feather } from '@expo/vector-icons'

const PasswordField = styled(Input, {
  flex: 1,
  size: '$4',
  bg: '$background0',
  borderWidth: 0,
  color: '$text-emphasis',
  placeholderTextColor: '$placeholderColor',
  focusStyle: {
    borderWidth: 0,
    outlineWidth: 0,
  },
})

const EYE_BUTTON_WIDTH = 44
const EYE_ICON_SIZE = 18

type PasswordInputProps = {
  value: string
  onChangeText: (text: string) => void
  placeholder: string
  onBlur?: () => void
  onSubmitEditing?: () => void
  returnKeyType?: 'done' | 'next' | 'go'
  autoComplete?: 'current-password' | 'new-password'
}

type PasswordInputHandle = { focus: () => void }

const PasswordInput = ({
  value,
  onChangeText,
  placeholder,
  onBlur,
  onSubmitEditing,
  returnKeyType = 'done',
  autoComplete = 'current-password',
  ref,
}: PasswordInputProps & { ref?: Ref<PasswordInputHandle> }) => {
  const [visible, setVisible] = useState(false)
  const [focused, setFocused] = useState(false)
  const inputRef = useRef<ComponentRef<typeof Input>>(null)
  const theme = useTheme()

  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus(),
  }))

  return (
    <XStack
      position="relative"
      alignSelf="stretch"
      borderRadius="$4"
      borderWidth={1}
      borderColor={focused ? '$accentBackground' : '$borderColor'}
      bg="$surface-card"
      overflow="hidden">
      <PasswordField
        ref={inputRef}
        value={value}
        onChangeText={onChangeText}
        onFocus={() => setFocused(true)}
        onBlur={() => { setFocused(false); onBlur?.() }}
        onSubmitEditing={onSubmitEditing}
        returnKeyType={returnKeyType}
        placeholder={placeholder}
        pr={EYE_BUTTON_WIDTH}
        secureTextEntry={!visible}
        autoComplete={autoComplete}
        autoCapitalize="none"
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
          size={EYE_ICON_SIZE}
          color={theme['text-placeholder'].val}
        />
      </BaseTouchable>
    </XStack>
  )
}

export { PasswordInput }
export type { PasswordInputHandle }
