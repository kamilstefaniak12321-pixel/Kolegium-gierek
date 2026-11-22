# Kolegium gierek

Przeglądarkowa aplikacja do wspólnej gry na komputerach i telefonach. Gospodarz zakłada pokój, a znajomi dołączają przez link lub sześcioma znakami kodu. Każdy gra u siebie i widzi tę samą rundę. W jednym pokoju mieści się od 2 do 8 graczy.

## Uruchomienie na komputerze

W katalogu projektu, z zainstalowanym Node.js 22 lub nowszym, uruchom:

```sh
npm start
```

Otwórz **http://localhost:3000**. Projekt używa standardowej biblioteki Node.js. Do uruchomienia gry wystarczy samo `npm start`.

**Telefon w tej samej sieci Wi-Fi.** Serwer wypisuje w terminalu adres sieciowy komputera, np. `http://192.168.1.42:3000`. Otwórz wypisany adres na obu urządzeniach. Wybierz na komputerze **Utwórz pokój**, a na telefonie wpisz kod. Jeśli Windows zapyta o zaporę, zezwól aplikacji Node.js na połączenia w sieci prywatnej.

**Gra przez internet.** Uruchom pojedynczą instancję serwera Node.js pod wspólnym adresem HTTPS. Przycisk otwiera konfigurację usługi Render przygotowaną dla tego repozytorium. Po wdrożeniu wyślij znajomym link z przycisku **Zaproś** w pokoju.

[Uruchom własny serwer na Render](https://render.com/deploy?repo=https://github.com/kamilstefaniak12321-pixel/Kolegium-gierek)

Na własnym hostingu ustaw `PORT` zgodnie z konfiguracją usługi. Domyślne wartości to port `3000` i nasłuch na `0.0.0.0`. Punkt kontrolny serwera to `/healthz`. Jeżeli używasz odwrotnego proxy, pozwól na żądania oczekujące co najmniej 25 sekund.

## Pierwsza gra · Literowe zdania

1. Gospodarz wybiera 1, 3 lub 5 rund, po 60, 90 lub 120 sekund. Domyślnie gracie 3 rundy po 90 sekund.
2. Serwer losuje wszystkim ten sam zestaw 12 różnych liter. Każdy zestaw zapewnia przynajmniej jedno zdanie ze słownika i co najmniej trzy samogłoski.
3. Układaj własne zdania z co najmniej dwóch słów. Każdej litery możesz użyć wielokrotnie. Z liter **A, K, L, M, O, T** ułożysz np. **„Ala ma kota”**. Litery **L** i **Ł** liczą się osobno.
4. Zdania zapisujesz pojedynczo. Ta sama odpowiedź, również po zmianie wielkości liter lub interpunkcji, liczy się danej osobie raz na rundę. Dwóch graczy może niezależnie wymyślić to samo zdanie. Swoją listę widzisz podczas pisania tylko Ty.
5. Gdy skończy się czas albo wszyscy klikną **Kończę pisanie**, grupa ma maksymalnie minutę na ocenę. Słownik wstępnie uznaje zdania ze znanych słów. Słowo spoza słownika kieruje całe zdanie pod głosowanie. Można również zgłosić bezsensowne zdanie ze znanych słów. Zgłoszenie jest głosem przeciw. Autor nie oddaje głosu na własne zdanie.
6. Sporne zdanie przechodzi, gdy głosów „za” jest więcej niż „przeciw”. Przy remisie lub braku głosów dostaje zero punktów. Każde uznane zdanie daje **1 punkt**. Wygrywa największa suma ze wszystkich rund, a przy remisie gracze dzielą miejsce. Rewanż zachowuje kod i skład pokoju.

## Połączenie i pokoje

Serwer losuje litery, odmierza czas oraz liczy wyniki. Przeglądarki pobierają zmiany przez długie odpytywanie HTTP. Sesja i robocza treść wpisu pozostają w tej samej karcie po odświeżeniu. Zamknięcie karty może zakończyć dostęp do tej sesji.

Gdy gospodarz straci połączenie na około 65 sekund, prowadzenie przejmuje obecny gracz. Po pięciu minutach nieobecności miejsce może zostać zwolnione, jeśli inni nadal grają. Do trwającego meczu wracają jego uczestnicy. Nowe osoby dołączają w poczekalni. Pokoje są w pamięci jednego procesu. Restart serwera lub dwie godziny bez kontaktu z pokojem kończą sesję.

Pod HTTPS można dodać aplikację do ekranu głównego telefonu. Gra wieloosobowa wymaga połączenia z serwerem.

## Rozwój platformy

- `public/catalog.js` zawiera katalog gier i zasady wyświetlane graczom.
- `src/rooms.js` obsługuje wspólne kody, miejsca, uprawnienia gospodarza i powroty do pokoju.
- `src/games/index.js` rejestruje silniki gier. Pierwszą implementacją jest `src/games/literowe-zdania.js`. Jej słownik to lista form wyrazowych w `src/games/slowa-pl.txt`, po jednej lub kilku formach w wierszu.
- `public/games/` zawiera ekrany kolejnych etapów danej gry. W `public/app.js` są wspólne formularze pokoju, zaproszenia i transport.
- `npm test` sprawdza reguły, liczenie punktów, czas i rozgrywkę dwóch klientów przez HTTP. Na GitHubie dodatkowo uruchamia się scenariusz Playwright z dwiema niezależnymi sesjami, w tym z emulacją telefonu.
