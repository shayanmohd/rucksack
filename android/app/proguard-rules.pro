# JS bridge: the WebView calls these by name via reflection.
-keepclassmembers class com.mohdshayan.rucksack.MainActivity$Native { public *; }
-keep class com.mohdshayan.rucksack.MainActivity$Native { *; }
