import { YStack } from 'tamagui'
import { LabelSm } from '@fonts'

type FormFieldProps = {
  children: React.ReactNode
  error?: string | null
}

export function FormField({ children, error }: FormFieldProps) {
  return (
    <YStack>
      {children}
      {error ? <LabelSm color="$red10" mt="$1" mb="$2">{error}</LabelSm> : null}
    </YStack>
  )
}
