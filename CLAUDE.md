# Notlar

## Sürüm geçmişi kuralı (her zaman son 2 sürüm)
GitHub'da bu repoda her zaman sadece son 2 sürüm (commit) tutulur. Yeni sürüm push edilirken en eski (3.) sürüm silinir:
1. Yeni değişikliği commit et.
2. Geçmişi son 2 commit kalacak şekilde yeniden yaz; bu 2 commit'in dosyaları, mesajı, yazarı ve tarihi aynen korunur, daha eskiler silinir.
3. `git push --force-with-lease` ile gönder (kullanıcının kalıcı izni var).
4. Push'tan sonra GitHub'da commit sayısının 2 olduğunu kontrol et.
Son sürümün dosyaları asla değişmemeli. Ek dallar da aynı kurala uyar.

Örnek (son 2 commit'i koruyup eski geçmişi silme):
```bash
H=$(git rev-parse HEAD); P=$(git rev-parse HEAD~1)
N1=$(git log -1 --format=%B $P | git commit-tree $P^{tree})
N2=$(git log -1 --format=%B $H | git commit-tree $H^{tree} -p $N1)
git push --force-with-lease=main:$H origin $N2:refs/heads/main
git reset --hard $N2
```
