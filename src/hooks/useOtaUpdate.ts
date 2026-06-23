import { useEffect, useState } from 'react';
import * as Updates from 'expo-updates';

type OtaUpdateState = {
  isUpdateReady: boolean;
  applyUpdate: () => Promise<void>;
};

const useOtaUpdate = (): OtaUpdateState => {
  const [isUpdateReady, setIsUpdateReady] = useState(false);

  useEffect(() => {
    if (__DEV__) return;

    const checkAndFetch = async () => {
      try {
        const result = await Updates.checkForUpdateAsync();
        if (!result.isAvailable) return;
        await Updates.fetchUpdateAsync();
        setIsUpdateReady(true);
      } catch {
        // silently ignore — OTA failures should never surface to the user
      }
    };

    checkAndFetch();
  }, []);

  const applyUpdate = async () => {
    try {
      await Updates.reloadAsync();
    } catch {
      // nothing to do if reload fails
    }
  };

  return { isUpdateReady, applyUpdate };
};

export { useOtaUpdate };
