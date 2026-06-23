import { type ReactNode } from 'react';
import { YStack } from 'tamagui';
import { LabelSm } from '@fonts';

type FormFieldProps = {
  children: ReactNode;
  error?: string | null;
};

const FormField = ({ children, error }: FormFieldProps) => (
  <YStack>
    {children}
    {error ? (
      <LabelSm color="$red10" mt="$1" mb="$2">
        {error}
      </LabelSm>
    ) : null}
  </YStack>
);

export { FormField };
